import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createCheckoutHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY, SITE_NAME } from "@/lib/constants";
import { getCatalogDiscount } from "@/lib/catalog";
import { isAllowedRequestOrigin } from "@/lib/urls";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// `catalogDiscount` resolves at request time so admin SiteSetting changes
// take effect without a deploy.
const handler = createCheckoutHandler({
  stripeSecret: env.STRIPE_SECRET_KEY(),
  queries,
  baseUrl: getBaseUrl(),
  currency: DEFAULT_CURRENCY,
  catalogDiscount: async () => {
    const percent = await getCatalogDiscount();
    return {
      percent,
      productName: `${SITE_NAME} — Complete Catalog (${percent}% off)`,
    };
  },
});

export async function POST(req: NextRequest) {
  // CSRF guard — the upstream handler is intentionally origin-agnostic.
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return handler(req);
}
