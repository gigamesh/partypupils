import { unstable_cache } from "next/cache";
import { prisma, queries } from "./db";
import { RELEASES_TAG } from "./cache-tags";
import { CATALOG_DISCOUNT_KEY, DEFAULT_DISCOUNT_PERCENT } from "./constants";

/**
 * Resolves the configurable "buy whole catalog" discount percentage.
 *
 * Settings are stored as JSON-encoded strings by `@gigamusic/db.setSetting`,
 * but party-pupils' production setting predates that and is a bare integer
 * string. Both `JSON.parse("15")` and the catch-fallback (returning the raw
 * `"15"`) ultimately go through `parseInt`, so either shape works.
 */
export async function getCatalogDiscount(): Promise<number> {
  const raw = await queries.getSetting<string | number>(CATALOG_DISCOUNT_KEY);
  if (raw === null) return DEFAULT_DISCOUNT_PERCENT;
  const value = typeof raw === "number" ? raw : parseInt(raw, 10);
  return Number.isNaN(value) ? DEFAULT_DISCOUNT_PERCENT : value;
}

/**
 * Aggregate published-catalog pricing for the "buy everything" CTA.
 *
 * The release fetch stays as a lean `findMany` (id + price only); routing it
 * through `queries.listPublishedReleases` would pull tracks + files on every
 * homepage render, which this projection is specifically designed to avoid.
 */
export const getCatalogPrice = unstable_cache(
  async () => {
    const [releases, discountPercent] = await Promise.all([
      prisma.release.findMany({
        where: { isPublished: true },
        select: { id: true, price: true },
      }),
      getCatalogDiscount(),
    ]);

    const originalPrice = releases.reduce((sum, r) => sum + r.price, 0);
    // Round to whole dollars so the displayed price stays tidy.
    const discountedPrice =
      Math.round((originalPrice * (1 - discountPercent / 100)) / 100) * 100;

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
