import type Stripe from "stripe";
import type { ReleaseWithTracks, TrackWithFiles } from "@gigamusic/db";
import { queries } from "./db";
import { stripe } from "./stripe";
import { getPublishedBundles, type PricedBundle } from "./bundles";
import { apportion, chargeableTotal } from "./pricing";
import { DEFAULT_CURRENCY, SITE_ALIAS } from "./constants";
import { getBaseUrl } from "./utils";

export interface BundleCheckoutItem {
  kind: "release" | "track" | "catalog" | "bundle";
  /** Numeric for release/track, string for bundle. */
  id?: number | string;
}

/** Stripe caps each metadata *value* at 500 characters. */
const STRIPE_METADATA_VALUE_LIMIT = 500;

/**
 * Build the Stripe Checkout Session for a cart containing at least one
 * admin-defined bundle.
 *
 * `@gigamusic/checkout` can't express this: its catalog branch hardcodes the
 * purchase to every published release, and its `catalogPurchase` hook only
 * supplies a total and a product name — no release subset. So we build the
 * session here, stamping the exact metadata shape
 * (`release_ids` / `track_ids` / `amounts`) that the package's
 * `fulfillCheckoutSession` already understands. Fulfillment, downloads, and
 * the order history therefore need no changes.
 *
 * A mixed cart (bundle + loose releases + loose tracks) is handled in one
 * session rather than being rejected — one payment, one order.
 */
export async function createBundleCheckoutSession(
  items: BundleCheckoutItem[],
): Promise<Response> {
  // The catalog subsumes everything, so the cart rules never produce this.
  if (items.some((i) => i.kind === "catalog")) {
    return jsonError("Cannot mix the catalog purchase with a bundle", 400);
  }

  const requestedBundleIds = [
    ...new Set(
      items
        .filter((i) => i.kind === "bundle" && typeof i.id === "string")
        .map((i) => i.id as string),
    ),
  ];

  const publishedBundles = await getPublishedBundles();
  const bundleById = new Map(publishedBundles.map((b) => [b.id, b]));

  // A bundle can be deleted or unpublished while it sits in someone's
  // localStorage. Say so precisely enough that the cart can offer a fix.
  const unavailable = requestedBundleIds.filter((id) => !bundleById.has(id));
  if (unavailable.length > 0) {
    return Response.json(
      { error: "bundle-unavailable", bundleIds: unavailable },
      { status: 409 },
    );
  }
  const bundles = requestedBundleIds.map((id) => bundleById.get(id)!);

  const looseReleaseIds = items
    .filter((i) => i.kind === "release" && typeof i.id === "number")
    .map((i) => i.id as number);
  const looseTrackIds = items
    .filter((i) => i.kind === "track" && typeof i.id === "number")
    .map((i) => i.id as number);

  // Single fetch sources both loose releases and loose tracks; tracks live
  // inside their release, so one round-trip keeps the lookups consistent.
  const allReleases =
    looseReleaseIds.length || looseTrackIds.length
      ? await queries.listPublishedReleases()
      : [];
  const releaseById = new Map(allReleases.map((r) => [r.id, r]));
  const trackContext = new Map<
    number,
    { track: TrackWithFiles; release: ReleaseWithTracks }
  >();
  for (const release of allReleases) {
    for (const track of release.tracks) trackContext.set(track.id, { track, release });
  }

  const baseUrl = getBaseUrl();
  const lineItems: NonNullable<Stripe.Checkout.SessionCreateParams["line_items"]> = [];
  // Per-line amounts actually charged, keyed `r<id>` / `t<id>`. `+=` because
  // one release can be reached by more than one line in a stale cart.
  const amounts: Record<string, number> = {};
  const releaseIds: number[] = [];
  const trackIds: number[] = [];

  for (const bundle of bundles) {
    const total = chargeableTotal(bundle.discountedPrice);
    lineItems.push({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: bundleProductName(bundle),
          ...(bundle.members[0]?.coverImageUrl
            ? { images: [toAbsoluteUrl(bundle.members[0].coverImageUrl, baseUrl)] }
            : {}),
        },
        unit_amount: total,
      },
      quantity: 1,
    });

    // Split the bundle price across its members so the persisted order items
    // sum to exactly what Stripe charged.
    const split = apportion(total, bundle.members.map((m) => ({ id: m.id, price: m.price })));
    for (const [id, cents] of split) {
      amounts[`r${id}`] = (amounts[`r${id}`] ?? 0) + cents;
      releaseIds.push(id);
    }
  }

  for (const id of looseReleaseIds) {
    const release = releaseById.get(id);
    if (!release) continue;
    lineItems.push({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: release.name,
          ...(release.coverImageUrl
            ? { images: [toAbsoluteUrl(release.coverImageUrl, baseUrl)] }
            : {}),
        },
        unit_amount: release.price,
      },
      quantity: 1,
    });
    amounts[`r${id}`] = (amounts[`r${id}`] ?? 0) + release.price;
    releaseIds.push(id);
  }

  for (const id of looseTrackIds) {
    const context = trackContext.get(id);
    if (!context) continue;
    const { track, release } = context;
    lineItems.push({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: `${release.name} — ${track.name}`,
          ...(release.coverImageUrl
            ? { images: [toAbsoluteUrl(release.coverImageUrl, baseUrl)] }
            : {}),
        },
        unit_amount: track.price,
      },
      quantity: 1,
    });
    amounts[`t${id}`] = (amounts[`t${id}`] ?? 0) + track.price;
    trackIds.push(id);
  }

  if (lineItems.length === 0) {
    return jsonError("No valid items found", 400);
  }

  const metadata: Record<string, string> = {
    site: SITE_ALIAS,
    // Deduped so a release reachable from two lines still yields one order item.
    release_ids: JSON.stringify([...new Set(releaseIds)]),
    track_ids: JSON.stringify([...new Set(trackIds)]),
    amounts: JSON.stringify(amounts),
    // Ignored by fulfillment; kept for support ("what did they actually buy?").
    bundle_ids: JSON.stringify(requestedBundleIds),
  };
  warnOnOversizedMetadata(metadata);

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata,
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[bundle-checkout] Failed to create checkout session:", err);
    return jsonError("Failed to create checkout session", 500);
  }
}

function bundleProductName(bundle: PricedBundle): string {
  const count = `${bundle.members.length} releases`;
  return bundle.discountPercent > 0
    ? `${bundle.name} (${count}, ${bundle.discountPercent}% off)`
    : `${bundle.name} (${count})`;
}

/**
 * Metadata that exceeds Stripe's per-value limit is silently truncated, which
 * would drop releases from the order. The schema caps (20 bundles x 40
 * releases) keep us clear, but log loudly if that assumption ever breaks.
 */
function warnOnOversizedMetadata(metadata: Record<string, string>): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (value.length > STRIPE_METADATA_VALUE_LIMIT) {
      console.error(
        `[bundle-checkout] metadata.${key} is ${value.length} chars, over Stripe's ${STRIPE_METADATA_VALUE_LIMIT} limit — the order will be recorded incomplete.`,
      );
    }
  }
}

/** Resolve a stored relative URL against `baseUrl` and percent-encode the path. Mirrors @gigamusic/checkout. */
function toAbsoluteUrl(url: string, baseUrl: string): string {
  const raw = url.startsWith("http")
    ? url
    : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  try {
    const parsed = new URL(raw);
    parsed.pathname = encodeURI(decodeURI(parsed.pathname));
    return parsed.toString();
  } catch {
    return raw;
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
