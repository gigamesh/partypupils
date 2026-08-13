import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { db, queries } from "./db";
import { releases, tracks } from "@/db/schema";
import { RELEASES_TAG } from "./cache-tags";
import { BUNDLES_SETTING_KEY } from "./constants";
import {
  BundlesConfigSchema,
  EMPTY_BUNDLES_CONFIG,
  memberNoun,
  type BundlesConfig,
} from "./bundle-schema";
import { applyBundleDiscount } from "./pricing";

/** A release in a bundle. */
export interface BundleReleaseMember {
  id: number;
  name: string;
  slug: string;
  price: number;
  coverImageUrl: string | null;
}

/**
 * A song in a bundle. A song has no artwork of its own, so `coverImageUrl` is
 * its release's — and `releaseId` is what the cart's overlap rules key off, a
 * singles bundle and a release bundle can't both grant the same song.
 */
export interface BundleTrackMember extends BundleReleaseMember {
  releaseId: number;
  releaseName: string;
}

interface PricedBundleBase {
  id: string;
  name: string;
  description?: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  /** Up to four distinct member covers, for the card's cover stack. */
  coverImageUrls: string[];
}

export type PricedBundle = PricedBundleBase &
  (
    | { kind: "releases"; members: BundleReleaseMember[]; releaseIds: number[] }
    | {
        kind: "tracks";
        members: BundleTrackMember[];
        trackIds: number[];
        /** Deduped parent releases of `trackIds`. Cart overlap detection only. */
        trackReleaseIds: number[];
      }
  );

/** A release or song in the shape the admin bundle picker renders. */
export interface BundlePickerItem {
  id: number;
  name: string;
  price: number;
  coverImageUrl: string | null;
  /** Songs only — the release the song belongs to, to disambiguate the label. */
  releaseName?: string;
}

/**
 * Read the raw admin-authored bundle config. Uncached — the admin page and the
 * admin write path both need to see their own writes immediately.
 *
 * A malformed row degrades to an empty config rather than throwing, so a bad
 * hand-edit takes bundles off the storefront instead of 500ing `/music`.
 */
export async function getBundlesConfig(): Promise<BundlesConfig> {
  // `getSetting` already JSON.parses the stored value.
  const raw = await queries.getSetting<unknown>(BUNDLES_SETTING_KEY);
  if (raw === null) return EMPTY_BUNDLES_CONFIG;

  const parsed = BundlesConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  console.error("[bundles] Stored bundle config failed schema validation", parsed.error);
  return EMPTY_BUNDLES_CONFIG;
}

/** Published releases, in the projection both the storefront and the picker need. */
function selectPublishedReleases() {
  return db
    .select({
      id: releases.id,
      name: releases.name,
      slug: releases.slug,
      price: releases.price,
      coverImageUrl: releases.coverImageUrl,
    })
    .from(releases)
    .where(eq(releases.isPublished, true));
}

/**
 * Songs of published releases. A song inherits its release's cover and is only
 * sellable while that release is published, so the join carries both.
 */
function selectPublishedTracks() {
  return db
    .select({
      id: tracks.id,
      name: tracks.name,
      slug: tracks.slug,
      price: tracks.price,
      trackNumber: tracks.trackNumber,
      releaseId: releases.id,
      releaseName: releases.name,
      releaseSlug: releases.slug,
      coverImageUrl: releases.coverImageUrl,
    })
    .from(tracks)
    .innerJoin(releases, eq(tracks.releaseId, releases.id))
    .where(eq(releases.isPublished, true));
}

/** First four distinct covers — a singles bundle often draws several songs from one release. */
function coverStack(members: { coverImageUrl: string | null }[]): string[] {
  return [
    ...new Set(
      members
        .map((m) => m.coverImageUrl)
        .filter((url): url is string => url !== null),
    ),
  ].slice(0, 4);
}

/**
 * Resolve admin-defined bundles against the published catalog and price them.
 *
 * The release and track fetches are lean projections for the same reason as
 * `getCatalogPrice` — routing them through `queries.listPublishedReleases`
 * would pull tracks + files on every `/music` render.
 *
 * Member ids that no longer resolve (deleted or unpublished releases, songs
 * whose release was unpublished) are dropped silently: admins unpublish
 * releases without revisiting bundles, and that shouldn't break the page. A
 * bundle left with fewer than two members disappears entirely rather than
 * rendering as a one-item "bundle".
 */
export const getPublishedBundles = unstable_cache(
  async (): Promise<PricedBundle[]> => {
    const [config, releaseRows, trackRows] = await Promise.all([
      getBundlesConfig(),
      selectPublishedReleases(),
      selectPublishedTracks(),
    ]);

    const releaseById = new Map(releaseRows.map((r) => [r.id, r]));
    const trackById = new Map(
      trackRows.map((t) => [
        t.id,
        {
          id: t.id,
          name: t.name,
          // The release slug, matching how a loose song line addresses itself
          // in the cart — a song has no page of its own at the top level.
          slug: t.releaseSlug,
          price: t.price,
          coverImageUrl: t.coverImageUrl,
          releaseId: t.releaseId,
          releaseName: t.releaseName,
        } satisfies BundleTrackMember,
      ]),
    );

    return config.bundles.flatMap((bundle): PricedBundle[] => {
      if (!bundle.published) return [];

      // Preserve the admin-specified member order.
      const members =
        bundle.kind === "tracks"
          ? bundle.trackIds
              .map((id) => trackById.get(id))
              .filter((t): t is BundleTrackMember => t !== undefined)
          : bundle.releaseIds
              .map((id) => releaseById.get(id))
              .filter((r): r is BundleReleaseMember => r !== undefined);
      if (members.length < 2) return [];

      const originalPrice = members.reduce((sum, m) => sum + m.price, 0);
      const common = {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        originalPrice,
        discountedPrice: applyBundleDiscount(originalPrice, bundle.discountPercent),
        discountPercent: bundle.discountPercent,
        coverImageUrls: coverStack(members),
      };

      if (bundle.kind === "tracks") {
        const trackMembers = members as BundleTrackMember[];
        return [
          {
            ...common,
            kind: "tracks",
            members: trackMembers,
            trackIds: trackMembers.map((m) => m.id),
            trackReleaseIds: [...new Set(trackMembers.map((m) => m.releaseId))],
          },
        ];
      }

      return [
        {
          ...common,
          kind: "releases",
          members,
          releaseIds: members.map((m) => m.id),
        },
      ];
    });
  },
  // v2 moves `coverImageUrls` onto the bundle and adds the `kind` discriminator;
  // a warm v1 entry would serve the card neither.
  ["published-bundles-v2"],
  { tags: [RELEASES_TAG], revalidate: 3600 },
);

/**
 * Look up one bundle for checkout. Deliberately reads through
 * `getPublishedBundles` so the price the storefront shows and the price Stripe
 * charges can never diverge.
 */
export async function getBundleForCheckout(id: string): Promise<PricedBundle | undefined> {
  return (await getPublishedBundles()).find((b) => b.id === id);
}

/** Stripe line-item name for a bundle — what the customer sees on the receipt. */
export function bundleProductName(bundle: PricedBundle): string {
  const count = memberNoun(bundle.kind, bundle.members.length);
  return bundle.discountPercent > 0
    ? `${bundle.name} (${count}, ${bundle.discountPercent}% off)`
    : `${bundle.name} (${count})`;
}

/** Published releases for the admin bundle picker. */
export async function listPickerReleases(): Promise<BundlePickerItem[]> {
  return (await selectPublishedReleases().orderBy(releases.name)).map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    coverImageUrl: r.coverImageUrl,
  }));
}

/** Published songs for the admin bundle picker, grouped by release in track order. */
export async function listPickerTracks(): Promise<BundlePickerItem[]> {
  const rows = await selectPublishedTracks().orderBy(
    releases.name,
    tracks.trackNumber,
  );
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    coverImageUrl: t.coverImageUrl,
    releaseName: t.releaseName,
  }));
}
