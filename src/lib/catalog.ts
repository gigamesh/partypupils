import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { RELEASES_TAG } from "./cache-tags";

const DEFAULT_DISCOUNT_PERCENT = 15;

export async function getCatalogDiscount(): Promise<number> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: "catalog_discount_percent" },
  });
  const value = parseInt(setting?.value || "");
  return isNaN(value) ? DEFAULT_DISCOUNT_PERCENT : value;
}

export const getCatalogPrice = unstable_cache(
  async () => {
    const [releases, discountPercent] = await Promise.all([
      prisma.release.findMany({ where: { isPublished: true }, select: { id: true, price: true } }),
      getCatalogDiscount(),
    ]);

    const originalPrice = releases.reduce((sum, r) => sum + r.price, 0);
    const discountedPrice = Math.round((originalPrice * (1 - discountPercent / 100)) / 100) * 100;

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
