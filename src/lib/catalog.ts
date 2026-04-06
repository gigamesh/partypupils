import { prisma } from "./db";

const DEFAULT_DISCOUNT_PERCENT = 15;

export async function getCatalogDiscount(): Promise<number> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: "catalog_discount_percent" },
  });
  const value = parseInt(setting?.value || "");
  return isNaN(value) ? DEFAULT_DISCOUNT_PERCENT : value;
}

export async function getCatalogPrice() {
  const [releases, discountPercent] = await Promise.all([
    prisma.release.findMany({ where: { isPublished: true }, select: { id: true, price: true } }),
    getCatalogDiscount(),
  ]);

  const originalPrice = releases.reduce((sum, r) => sum + r.price, 0);
  const discountedPrice = Math.round(originalPrice * (1 - discountPercent / 100));

  return {
    originalPrice,
    discountedPrice,
    discountPercent,
    releaseCount: releases.length,
    releaseIds: releases.map((r) => r.id),
  };
}
