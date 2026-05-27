import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createCheckoutHandler } from "@gigamusic/checkout";
import type { CheckoutCartItem } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY, SITE_NAME } from "@/lib/constants";
import { getCatalogDiscount } from "@/lib/catalog";
import { isAllowedRequestOrigin } from "@/lib/urls";

interface PartyPupilsCartItem {
  releaseId?: number;
  trackId?: number;
  catalogPurchase?: boolean;
}

/**
 * Map party-pupils' historical cart shape (`{ releaseId, trackId,
 * catalogPurchase }`) onto `@gigamusic/checkout`'s `{ kind, id }`. The cart UI
 * still emits the old shape and is intentionally out of scope for this swap;
 * the translation stays at the route boundary so the package consumes its
 * canonical input.
 */
function translateCart(items: PartyPupilsCartItem[]): CheckoutCartItem[] {
  return items.map((item): CheckoutCartItem => {
    if (item.catalogPurchase) return { kind: "catalog" };
    if (item.trackId != null) return { kind: "track", id: item.trackId };
    return { kind: "release", id: item.releaseId };
  });
}

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

/**
 * Wraps `@gigamusic/checkout.createCheckoutHandler`. Recreated per request so
 * an admin-changed catalog discount picks up on the next call without a
 * deployment cycle (the underlying setting read is cheap and lives behind a
 * cache tag elsewhere).
 *
 * Origin check and cart-shape translation stay outside the handler — the
 * package contract is shape-strict and CSRF-agnostic by design.
 */
export async function POST(req: NextRequest) {
  if (!isAllowedRequestOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { items?: PartyPupilsCartItem[] };
  try {
    payload = (await req.json()) as { items?: PartyPupilsCartItem[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const translatedItems = translateCart(payload.items ?? []);
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

  // Re-encode the translated body into a new request so the package's
  // `req.json()` sees the canonical `{ kind, id }` cart shape. The
  // `as unknown as NextRequest` bridges party-pupils' Next 16.2.2 typings to
  // the package's Next 16.2.6 typings — the runtime shapes match.
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ items: translatedItems }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler(forwarded as any);
}
