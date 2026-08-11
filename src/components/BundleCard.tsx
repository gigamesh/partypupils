"use client";

import { useCart } from "./CartProvider";
import { BundleCoverStack } from "./BundleCoverStack";
import { Button } from "@/components/ui/button";
import type { CartItem } from "@/lib/cart-rules";
import { formatCurrency } from "@/lib/utils";

/** Normalized shape covering both admin-defined bundles and the whole-catalog bundle. */
export interface BundleCardData {
  kind: "bundle" | "catalog";
  /** Present for admin-defined bundles only. */
  id?: string;
  name: string;
  description?: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  releaseCount: number;
  releaseIds: number[];
  coverImageUrls: string[];
}

export function BundleCard({ bundle }: { bundle: BundleCardData }) {
  const { addItem, removeItem, coverage, conflictFor } = useCart();

  const item: CartItem =
    bundle.kind === "catalog"
      ? {
          catalogPurchase: true,
          name: bundle.name,
          slug: "",
          price: bundle.discountedPrice,
          coverImageUrl: null,
          bundleCoverImageUrls: bundle.coverImageUrls,
        }
      : {
          bundleId: bundle.id,
          bundleReleaseIds: bundle.releaseIds,
          bundleCoverImageUrls: bundle.coverImageUrls,
          name: bundle.name,
          slug: "",
          price: bundle.discountedPrice,
          coverImageUrl: bundle.coverImageUrls[0] ?? null,
        };

  const covered = coverage(item);
  const conflict =
    bundle.kind === "bundle" && !covered
      ? conflictFor({ bundleId: bundle.id!, bundleReleaseIds: bundle.releaseIds })
      : null;

  const discounted = bundle.discountPercent > 0 && bundle.originalPrice > bundle.discountedPrice;

  return (
    // @container so the card lays itself out by its own width, not the
    // viewport's — in the 2-up grid a "tablet" viewport gives it half that.
    <div className="@container rounded-lg glass-panel p-4">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="flex items-center gap-3">
          <BundleCoverStack coverImageUrls={bundle.coverImageUrls} />
          <div>
            <h3 className="text-base font-semibold">{bundle.name}</h3>
            <p className="text-sm text-muted-foreground">
              {bundle.releaseCount} release{bundle.releaseCount === 1 ? "" : "s"}
              {discounted && ` — ${bundle.discountPercent}% off`}
            </p>
            {bundle.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{bundle.description}</p>
            )}
            <div className="mt-1 flex items-center gap-3">
              <span className="text-lg font-bold text-neon">
                {formatCurrency(bundle.discountedPrice)}
              </span>
              {discounted && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(bundle.originalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>

        {covered?.kind === "self" ? (
          <Button variant="secondary" onClick={() => removeItem(item)}>
            Remove from Cart
          </Button>
        ) : covered ? (
          <Button variant="secondary" disabled>
            {covered.kind === "catalog" ? "Included in catalog" : `Included in ${covered.name}`}
          </Button>
        ) : conflict === "overlap" ? (
          <Button variant="secondary" disabled>
            Overlaps a bundle in your cart
          </Button>
        ) : (
          <Button onClick={() => addItem(item)}>Add to Cart</Button>
        )}
      </div>
    </div>
  );
}
