import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createCheckoutHandler } from "@gigamusic/checkout";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY, SITE_ALIAS, SITE_NAME } from "@/lib/constants";
import { getCatalogPrice } from "@/lib/catalog";
import { bundleProductName, getBundleForCheckout } from "@/lib/bundles";
import { isAllowedRequestOrigin } from "@/lib/urls";

// `catalogPurchase` and `bundlePurchase` are resolved at request time so
// admin-changed pricing picks up on the next call without redeploying. 0.3.0
// made the consumer own pricing math (the package no longer applies a discount
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
  // Resolved through `getBundleForCheckout` — the same cached read the
  // storefront renders from — so the displayed price and the charged price
  // cannot diverge. Returning null makes the package reply 409
  // `bundle-unavailable`, which the cart page turns into a remove prompt.
  bundlePurchase: async (bundleId) => {
    const bundle = await getBundleForCheckout(bundleId);
    if (!bundle) return null;
    return {
      totalCents: bundle.discountedPrice,
      productName: bundleProductName(bundle),
      // A bundle holds releases or songs, never both, so exactly one of these
      // is sent. The package apportions the total across whichever it gets.
      ...(bundle.kind === "tracks"
        ? { trackIds: bundle.trackIds }
        : { releaseIds: bundle.releaseIds }),
    };
  },
});

/**
 * Stripe Checkout entry point. Body lives in
 * `@gigamusic/checkout.createCheckoutHandler`; this file is just the
 * env-reading boundary plus a CSRF origin check (the package is intentionally
 * CSRF-agnostic). Cart UI emits the canonical `{ kind, id }` / `{ kind,
 * bundleId }` shape directly, so the body passes through untouched.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return handler(req);
}
