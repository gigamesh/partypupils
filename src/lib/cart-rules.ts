/**
 * Pure cart semantics, extracted from `CartProvider` so they can be unit
 * tested (the vitest setup is node-env, with no DOM for hooks).
 *
 * The rules exist to stop a customer paying twice for the same release. Three
 * kinds of item can grant a release: the release itself, a custom bundle
 * containing it, and the whole-catalog purchase.
 */

export interface CartItem {
  releaseId?: number;
  trackId?: number;
  /**
   * The release a track belongs to. Coverage checks only — it deliberately
   * does not participate in `cartItemKey`, so a track never collides with its
   * own release.
   */
  parentReleaseId?: number;
  catalogPurchase?: boolean;
  bundleId?: string;
  /** Member release ids, snapshotted when the bundle was added to the cart. */
  bundleReleaseIds?: number[];
  bundleCoverImageUrls?: string[];
  name: string;
  slug: string;
  price: number;
  coverImageUrl: string | null;
  releaseName?: string;
}

export type CartItemRef = Pick<
  CartItem,
  "releaseId" | "trackId" | "parentReleaseId" | "catalogPurchase" | "bundleId"
>;

export type Coverage =
  /** The exact item is in the cart. */
  | { kind: "self" }
  /** Granted by the whole-catalog purchase. */
  | { kind: "catalog" }
  /** Granted by a custom bundle already in the cart. */
  | { kind: "bundle"; bundleId: string; name: string };

/**
 * Stable identity for a cart line.
 *
 * Branch order matters: the track check must come before the release check so
 * a track carrying `parentReleaseId` doesn't take its parent's key.
 */
export function cartItemKey(item: CartItemRef): string {
  if (item.catalogPurchase) return "catalog";
  if (item.bundleId) return `bundle-${item.bundleId}`;
  if (item.trackId != null) return `track-${item.trackId}`;
  return `release-${item.releaseId}`;
}

export function hasCatalog(items: CartItem[]): boolean {
  return items.some((i) => i.catalogPurchase);
}

/** Every release id granted by a bundle currently in the cart. */
export function coveredReleaseIds(items: CartItem[]): Set<number> {
  const covered = new Set<number>();
  for (const item of items) {
    if (item.bundleId && item.bundleReleaseIds) {
      for (const id of item.bundleReleaseIds) covered.add(id);
    }
  }
  return covered;
}

/** The release a ref depends on for bundle coverage, if any. */
function coverageTarget(ref: CartItemRef): number | undefined {
  if (ref.bundleId || ref.catalogPurchase) return undefined;
  return ref.releaseId ?? ref.parentReleaseId;
}

/**
 * Why a ref already counts as bought, or `null` if it doesn't.
 *
 * Distinguishing "self" from "covered" is what lets the UI show a real Remove
 * button for things the customer added, and an inert "Included in …" for
 * things a bundle granted.
 */
export function coverageOf(items: CartItem[], ref: CartItemRef): Coverage | null {
  const key = cartItemKey(ref);
  if (items.some((i) => cartItemKey(i) === key)) return { kind: "self" };

  if (ref.catalogPurchase) return null;
  if (hasCatalog(items)) return { kind: "catalog" };

  const target = coverageTarget(ref);
  if (target == null) return null;

  const owner = items.find((i) => i.bundleReleaseIds?.includes(target));
  return owner?.bundleId ? { kind: "bundle", bundleId: owner.bundleId, name: owner.name } : null;
}

export function isItemInCart(items: CartItem[], ref: CartItemRef): boolean {
  return coverageOf(items, ref) !== null;
}

/**
 * Why a bundle can't be added: the catalog already covers everything, or one
 * of its releases is already granted by another bundle in the cart.
 *
 * Overlap is rejected rather than merged because the two bundles have
 * independent discounts — there's no honest single price for the union.
 */
export function bundleConflict(
  items: CartItem[],
  bundle: { bundleId: string; bundleReleaseIds: number[] },
): "catalog" | "overlap" | null {
  if (hasCatalog(items)) return "catalog";
  const covered = coveredReleaseIds(
    items.filter((i) => i.bundleId !== bundle.bundleId),
  );
  return bundle.bundleReleaseIds.some((id) => covered.has(id)) ? "overlap" : null;
}

/**
 * Add an item, enforcing the no-double-purchase rules. Returns the original
 * array unchanged when the add is a no-op, so callers can skip the write.
 */
export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  // The catalog subsumes everything, so it replaces the cart outright.
  if (item.catalogPurchase) return [item];
  if (hasCatalog(items)) return items;

  const key = cartItemKey(item);
  if (items.some((i) => cartItemKey(i) === key)) return items;

  if (item.bundleId) {
    const members = new Set(item.bundleReleaseIds ?? []);
    if (
      bundleConflict(items, {
        bundleId: item.bundleId,
        bundleReleaseIds: item.bundleReleaseIds ?? [],
      })
    ) {
      return items;
    }
    // Absorb anything the bundle now grants: member releases, and tracks
    // belonging to a member release.
    return [
      ...items.filter((i) => {
        if (i.releaseId != null && members.has(i.releaseId)) return false;
        if (i.parentReleaseId != null && members.has(i.parentReleaseId)) return false;
        return true;
      }),
      item,
    ];
  }

  const target = coverageTarget(item);
  if (target != null && coveredReleaseIds(items).has(target)) return items;

  return [...items, item];
}

/** Remove by identity. Removing a bundle does not restore the lines it absorbed. */
export function removeCartItem(items: CartItem[], ref: CartItemRef): CartItem[] {
  const key = cartItemKey(ref);
  return items.filter((i) => cartItemKey(i) !== key);
}
