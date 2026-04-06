"use client";

import { useCart } from "./CartProvider";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface CatalogBannerProps {
  catalog: {
    originalPrice: number;
    discountedPrice: number;
    discountPercent: number;
    releaseCount: number;
  };
}

export function CatalogBanner({ catalog }: CatalogBannerProps) {
  const { addItem, removeItem, isInCart } = useCart();

  const inCart = isInCart({ catalogPurchase: true });

  const catalogItem = {
    catalogPurchase: true as const,
    name: "Complete Catalog",
    slug: "",
    price: catalog.discountedPrice,
    coverImageUrl: null,
  };

  return (
    <div className="mb-8 rounded-lg border border-neon/30 bg-card p-6 neon-box-shadow">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Buy the Complete Catalog</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Get all {catalog.releaseCount} releases — {catalog.discountPercent}% off
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-bold text-neon">
              {formatCurrency(catalog.discountedPrice)}
            </span>
            <span className="text-sm text-muted-foreground line-through">
              {formatCurrency(catalog.originalPrice)}
            </span>
          </div>
        </div>
        {inCart ? (
          <Button variant="secondary" onClick={() => removeItem(catalogItem)}>
            Remove from Cart
          </Button>
        ) : (
          <Button onClick={() => addItem(catalogItem)}>
            Add to Cart
          </Button>
        )}
      </div>
    </div>
  );
}
