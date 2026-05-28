import { unstable_cache } from "next/cache";
import { applyCatalogDiscount, sumLineItems } from "@gigamusic/core";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "./db";
import { RELEASES_TAG } from "./cache-tags";

const DEFAULT_DISCOUNT_PERCENT = 15;
const CATALOG_DISCOUNT_KEY = "catalog_discount_percent";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Tolerates both shapes the setting may take: a JSON-encoded number (current
// writer) or a bare integer string (legacy production rows).
export async function getCatalogDiscount(): Promise<number> {
  const raw = await queries.getSetting<string | number>(CATALOG_DISCOUNT_KEY);
  if (raw === null) return DEFAULT_DISCOUNT_PERCENT;
  const value = typeof raw === "number" ? raw : parseInt(raw, 10);
  return Number.isNaN(value) ? DEFAULT_DISCOUNT_PERCENT : value;
}

// Lean `findMany` (id + price only) — the package's `listPublishedReleases`
// would pull tracks + files on every homepage render.
export const getCatalogPrice = unstable_cache(
  async () => {
    const [releases, discountPercent] = await Promise.all([
      prisma.release.findMany({
        where: { isPublished: true },
        select: { id: true, price: true },
      }),
      getCatalogDiscount(),
    ]);

    const originalPrice = sumLineItems(
      releases.map((r) => ({ id: r.id, priceCents: r.price })),
    );
    const { totalCents: discountedPrice } = applyCatalogDiscount(
      originalPrice,
      discountPercent,
    );

    return {
      originalPrice,
      discountedPrice,
      discountPercent,
      releaseCount: releases.length,
      releaseIds: releases.map((r) => r.id),
    };
  },
  ["catalog-price-v1"],
  { tags: [RELEASES_TAG], revalidate: 3600 },
);
