import { BundleCard, type BundleCardData } from "./BundleCard";
import type { PricedBundle } from "@/lib/bundles";

interface CatalogSummary {
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  releaseCount: number;
  releaseIds: number[];
  coverImageUrls: string[];
}

interface BundlesSectionProps {
  bundles: PricedBundle[];
  /** Null when the catalog is too small to be worth bundling. */
  catalog: CatalogSummary | null;
}

function toCardData(bundle: PricedBundle): BundleCardData {
  return {
    kind: "bundle",
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    originalPrice: bundle.originalPrice,
    discountedPrice: bundle.discountedPrice,
    discountPercent: bundle.discountPercent,
    releaseCount: bundle.members.length,
    releaseIds: bundle.releaseIds,
    coverImageUrls: bundle.members
      .map((m) => m.coverImageUrl)
      .filter((url): url is string => url !== null)
      .slice(0, 4),
  };
}

/** Discounted packs above the release grid: admin-defined bundles first, whole catalog last. */
export function BundlesSection({ bundles, catalog }: BundlesSectionProps) {
  const cards: BundleCardData[] = bundles.map(toCardData);

  if (catalog) {
    cards.push({
      kind: "catalog",
      name: "Buy the Complete Catalog",
      originalPrice: catalog.originalPrice,
      discountedPrice: catalog.discountedPrice,
      discountPercent: catalog.discountPercent,
      releaseCount: catalog.releaseCount,
      releaseIds: catalog.releaseIds,
      coverImageUrls: catalog.coverImageUrls,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="mb-8 grid gap-3 md:grid-cols-2">
      {cards.map((card) => (
        <BundleCard key={card.kind === "catalog" ? "catalog" : card.id} bundle={card} />
      ))}
    </div>
  );
}
