import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createCheckoutHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY, SITE_NAME } from "@/lib/constants";
import { getCatalogPrice } from "@/lib/catalog";
import { isAllowedRequestOrigin } from "@/lib/urls";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// `catalogPurchase` is resolved at request time so admin-changed catalog
// pricing picks up on the next call without redeploying. 0.3.0 made the
// consumer own pricing math (the package no longer applies a discount
// percent itself), so we pass the already-computed `totalCents` here.
const handler = createCheckoutHandler({
  stripeSecret: env.STRIPE_SECRET_KEY(),
  queries,
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
 */
export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return handler(req);
}
