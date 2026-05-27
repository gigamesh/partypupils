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

/**
 * Wraps `@gigamusic/checkout.createCheckoutHandler`. Recreated per request so
 * an admin-changed catalog discount picks up on the next call without a
 * deployment cycle (the underlying setting read is cheap and lives behind a
 * cache tag elsewhere).
 *
 * Origin check stays outside the handler — the package contract is
 * CSRF-agnostic by design. The cart UI now emits the canonical
 * `{ kind, id }` shape directly, so the body passes through untouched.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const discountPercent = await getCatalogDiscount();

  const handler = createCheckoutHandler({
    stripeSecret: env.STRIPE_SECRET_KEY(),
    queries,
    baseUrl: getBaseUrl(),
    currency: DEFAULT_CURRENCY,
    catalogDiscount: {
      percent: discountPercent,
      productName: `${SITE_NAME} — Complete Catalog (${discountPercent}% off)`,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler(req as any);
}
