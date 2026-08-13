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
  const common = {
    kind: "bundle" as const,
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    originalPrice: bundle.originalPrice,
    discountedPrice: bundle.discountedPrice,
    discountPercent: bundle.discountPercent,
    memberCount: bundle.members.length,
    coverImageUrls: bundle.coverImageUrls,
  };

  return bundle.kind === "tracks"
    ? {
        ...common,
        memberKind: "tracks",
        releaseIds: [],
        trackIds: bundle.trackIds,
        trackReleaseIds: bundle.trackReleaseIds,
      }
    : { ...common, memberKind: "releases", releaseIds: bundle.releaseIds };
}

/** Discounted packs above the release grid: admin-defined bundles first, whole catalog last. */
export function BundlesSection({ bundles, catalog }: BundlesSectionProps) {
  const cards: BundleCardData[] = bundles.map(toCardData);

  if (catalog) {
    cards.push({
      kind: "catalog",
      // A title, like the bundle names beside it — the old banner's
      // "Buy the Complete Catalog" read as a CTA and made this card look
      // like a different kind of thing from the cards next to it.
      name: "Complete Catalog",
      originalPrice: catalog.originalPrice,
      discountedPrice: catalog.discountedPrice,
      discountPercent: catalog.discountPercent,
      memberKind: "releases",
      memberCount: catalog.releaseCount,
      releaseIds: catalog.releaseIds,
      coverImageUrls: catalog.coverImageUrls,
    });
  }

  if (cards.length === 0) return null;

  return (
    // A single card (the common case before any bundle is defined) stays full
    // width — a lone half-width card with an empty column beside it reads as a
    // layout bug rather than a deliberate grid.
    <div className={cards.length > 1 ? "mb-8 grid gap-3 md:grid-cols-2" : "mb-8"}>
      {cards.map((card) => (
        <BundleCard key={card.kind === "catalog" ? "catalog" : card.id} bundle={card} />
      ))}
    </div>
  );
}
