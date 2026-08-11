/**
 * Checkout session construction. The invariant that matters throughout: the
 * `amounts` metadata must sum to the session total, because
 * `fulfillCheckoutSession` turns those into `order_items.price` rows and
 * refunds/admin totals rely on `sum(items) === orders.amountTotal`.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/checkout/route";
import { queries, db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { BUNDLES_SETTING_KEY, CATALOG_DISCOUNT_KEY, SITE_ALIAS } from "@/lib/constants";
import type { Bundle } from "@/lib/bundle-schema";
import { makeRelease, makeTrackWithFile } from "../factories";

const BASE_URL = "http://localhost:3000";

function checkoutRequest(items: unknown[], origin = BASE_URL): NextRequest {
  return new Request(`${BASE_URL}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ items }),
  }) as NextRequest;
}

async function storeBundle(bundle: Partial<Bundle> & { releaseIds: number[] }) {
  await queries.setSetting(BUNDLES_SETTING_KEY, {
    bundles: [
      {
        id: bundle.id ?? "summer",
        name: bundle.name ?? "Summer Pack",
        releaseIds: bundle.releaseIds,
        discountPercent: bundle.discountPercent ?? 20,
        published: bundle.published ?? true,
      },
    ],
  });
}

/** The params handed to Stripe by the last `sessions.create` call. */
function lastSessionParams() {
  const calls = vi.mocked(stripe().checkout.sessions.create).mock.calls;
  return calls[calls.length - 1]![0] as {
    line_items: { price_data: { unit_amount: number; product_data: { name: string } } }[];
    metadata: Record<string, string>;
  };
}

function sumAmounts(metadata: Record<string, string>): number {
  return Object.values(JSON.parse(metadata.amounts!) as Record<string, number>).reduce(
    (s, v) => s + v,
    0,
  );
}

function sumLineItems(params: ReturnType<typeof lastSessionParams>): number {
  return params.line_items.reduce((s, li) => s + li.price_data.unit_amount, 0);
}

function mockSession() {
  vi.mocked(stripe().checkout.sessions.create).mockResolvedValue({
    url: "https://stripe.test/session",
  } as never);
}

describe("bundle checkout", () => {
  it("charges the discounted price and apportions it across members", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 2000 });
    await storeBundle({ releaseIds: [a.id, b.id], discountPercent: 20 });
    mockSession();

    const res = await POST(checkoutRequest([{ kind: "bundle", id: "summer" }]));
    expect(res.status).toBe(200);

    const params = lastSessionParams();
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0]!.price_data.unit_amount).toBe(2400);
    expect(params.line_items[0]!.price_data.product_data.name).toBe(
      "Summer Pack (2 releases, 20% off)",
    );

    expect(params.metadata.site).toBe(SITE_ALIAS);
    expect(JSON.parse(params.metadata.release_ids!).sort()).toEqual([a.id, b.id].sort());
    expect(JSON.parse(params.metadata.track_ids!)).toEqual([]);
    expect(JSON.parse(params.metadata.bundle_ids!)).toEqual(["summer"]);
    expect(sumAmounts(params.metadata)).toBe(2400);
  });

  it("builds one session for a mixed cart of bundle + release + track", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    const loose = await makeRelease({ price: 1500 });
    const trackHost = await makeRelease({ price: 800 });
    const track = await makeTrackWithFile(trackHost.id, { price: 250 });
    await storeBundle({ releaseIds: [a.id, b.id], discountPercent: 10 });
    mockSession();

    const res = await POST(
      checkoutRequest([
        { kind: "bundle", id: "summer" },
        { kind: "release", id: loose.id },
        { kind: "track", id: track.id },
      ]),
    );
    expect(res.status).toBe(200);

    const params = lastSessionParams();
    expect(params.line_items).toHaveLength(3);
    expect(sumAmounts(params.metadata)).toBe(sumLineItems(params));
    expect(JSON.parse(params.metadata.release_ids!).sort()).toEqual(
      [a.id, b.id, loose.id].sort(),
    );
    expect(JSON.parse(params.metadata.track_ids!)).toEqual([track.id]);
  });

  it("dedupes and merges when a release is reachable twice", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundle({ releaseIds: [a.id, b.id], discountPercent: 0 });
    mockSession();

    // A stale cart can hold both the bundle and one of its member releases.
    const res = await POST(
      checkoutRequest([
        { kind: "bundle", id: "summer" },
        { kind: "release", id: a.id },
      ]),
    );
    expect(res.status).toBe(200);

    const params = lastSessionParams();
    const releaseIds = JSON.parse(params.metadata.release_ids!) as number[];
    expect(new Set(releaseIds).size).toBe(releaseIds.length);
    expect(releaseIds.sort()).toEqual([a.id, b.id].sort());
    // Charged twice for `a`, so its single order item carries the summed price.
    expect(sumAmounts(params.metadata)).toBe(sumLineItems(params));
  });

  it("raises a sub-minimum bundle price to the Stripe floor", async () => {
    const a = await makeRelease({ price: 20 });
    const b = await makeRelease({ price: 20 });
    await storeBundle({ releaseIds: [a.id, b.id], discountPercent: 95 });
    mockSession();

    await POST(checkoutRequest([{ kind: "bundle", id: "summer" }]));
    const params = lastSessionParams();
    expect(params.line_items[0]!.price_data.unit_amount).toBe(50);
    expect(sumAmounts(params.metadata)).toBe(50);
  });

  it("409s with the offending ids when a bundle is no longer available", async () => {
    const a = await makeRelease();
    const b = await makeRelease();
    await storeBundle({ releaseIds: [a.id, b.id], published: false });
    mockSession();

    const res = await POST(checkoutRequest([{ kind: "bundle", id: "summer" }]));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "bundle-unavailable", bundleIds: ["summer"] });
    expect(vi.mocked(stripe().checkout.sessions.create)).not.toHaveBeenCalled();
  });

  it("rejects a cart mixing the catalog with a bundle", async () => {
    const a = await makeRelease();
    const b = await makeRelease();
    await storeBundle({ releaseIds: [a.id, b.id] });
    mockSession();

    const res = await POST(
      checkoutRequest([{ kind: "bundle", id: "summer" }, { kind: "catalog" }]),
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(stripe().checkout.sessions.create)).not.toHaveBeenCalled();
  });
});

describe("existing checkout paths are unaffected", () => {
  it("routes a catalog-only cart through the package handler", async () => {
    await makeRelease({ price: 1000 });
    await makeRelease({ price: 1000 });
    await queries.setSetting(CATALOG_DISCOUNT_KEY, 15);
    mockSession();

    const res = await POST(checkoutRequest([{ kind: "catalog" }]));
    expect(res.status).toBe(200);

    const params = lastSessionParams();
    expect(params.metadata.catalog_purchase).toBe("true");
    expect(params.line_items[0]!.price_data.unit_amount).toBe(1700);
  });

  it("routes a plain release cart through the package handler", async () => {
    const a = await makeRelease({ price: 1200 });
    mockSession();

    const res = await POST(checkoutRequest([{ kind: "release", id: a.id }]));
    expect(res.status).toBe(200);

    const params = lastSessionParams();
    expect(params.metadata.catalog_purchase).toBeUndefined();
    expect(params.line_items[0]!.price_data.unit_amount).toBe(1200);
    expect(JSON.parse(params.metadata.release_ids!)).toEqual([a.id]);
  });

  it("403s a cross-origin request before touching Stripe", async () => {
    mockSession();
    const res = await POST(checkoutRequest([{ kind: "catalog" }], "https://evil.test"));
    expect(res.status).toBe(403);
    expect(vi.mocked(stripe().checkout.sessions.create)).not.toHaveBeenCalled();
  });
});

describe("bundle fulfillment metadata", () => {
  it("records order items summing to the charged total", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 2000 });
    await storeBundle({ releaseIds: [a.id, b.id], discountPercent: 20 });
    mockSession();

    await POST(checkoutRequest([{ kind: "bundle", id: "summer" }]));
    const { metadata } = lastSessionParams();

    const { fulfillCheckoutSession } = await import("@gigamusic/checkout");
    const result = await fulfillCheckoutSession(
      {
        id: "cs_bundle_test",
        payment_intent: "pi_bundle_test",
        payment_status: "paid",
        amount_total: 2400,
        customer_details: { email: "buyer@test" },
        metadata,
      } as never,
      { queries, site: SITE_ALIAS },
    );

    expect(result.status).toBe("created");
    const order = await db.query.orders.findFirst({
      where: (o, { eq }) => eq(o.stripeSessionId, "cs_bundle_test"),
      with: { items: true },
    });
    expect(order!.items).toHaveLength(2);
    expect(order!.items.reduce((s, i) => s + i.price, 0)).toBe(order!.amountTotal);
  });
});
