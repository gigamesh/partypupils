import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createCheckoutHandler } from "@gigamusic/checkout";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY, SITE_ALIAS, SITE_NAME } from "@/lib/constants";
import { getCatalogPrice } from "@/lib/catalog";
import { createBundleCheckoutSession, type BundleCheckoutItem } from "@/lib/bundle-checkout";
import { isAllowedRequestOrigin } from "@/lib/urls";

// `catalogPurchase` is resolved at request time so admin-changed catalog
// pricing picks up on the next call without redeploying. 0.3.0 made the
// consumer own pricing math (the package no longer applies a discount
// percent itself), so we pass the already-computed `totalCents` here.
const handler = createCheckoutHandler({
  stripeSecret: env.STRIPE_SECRET_KEY(),
  queries,
  site: SITE_ALIAS,
  baseUrl: getBaseUrl(),
  currency: DEFAULT_CURRENCY,
  catalogPurchase: async () => {
    const { discountedPrice, discountPercent } = await getCatalogPrice();
    return {
      totalCents: discountedPrice,
      productName: `${SITE_NAME} — Complete Catalog (${discountPercent}% off)`,
    };
  },
});

/**
 * Stripe Checkout entry point. Body lives in
 * `@gigamusic/checkout.createCheckoutHandler`; this file is just the
 * env-reading boundary plus a CSRF origin check (the package is intentionally
 * CSRF-agnostic). Cart UI emits the canonical `{ kind, id }` shape directly,
 * so the body passes through untouched.
 *
 * Carts containing an admin-defined bundle divert to a local handler: the
 * package can't express a release *subset*, so `src/lib/bundle-checkout.ts`
 * builds that session itself. Everything else — plain carts and the whole
 * catalog — still goes through the package unchanged.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Read from a clone: `handler` calls `req.json()` itself, and a consumed
  // body would throw.
  let items: BundleCheckoutItem[] = [];
  try {
    ({ items = [] } = (await req.clone().json()) as { items?: BundleCheckoutItem[] });
  } catch {
    // Malformed body — let the package produce its own 400.
  }

  if (Array.isArray(items) && items.some((i) => i?.kind === "bundle")) {
    return createBundleCheckoutSession(items);
  }

  return handler(req);
}
