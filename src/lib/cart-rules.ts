/**
 * Pure cart semantics, extracted from `CartProvider` so they can be unit
 * tested (the vitest setup is node-env, with no DOM for hooks).
 *
 * The rules exist to stop a customer paying twice for the same thing. Four
 * kinds of item can grant something: the item itself, a bundle of releases, a
 * bundle of songs, and the whole-catalog purchase.
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
  /** Member release ids, snapshotted when a bundle of releases was added to the cart. */
  bundleReleaseIds?: number[];
  /** Member track ids, snapshotted when a bundle of songs was added to the cart. */
  bundleTrackIds?: number[];
  /**
   * The releases `bundleTrackIds` come from. Overlap detection only — a bundle
   * of songs does not grant these releases, but anything that grants a release
   * grants its songs, so the two can't sit in the cart together.
   */
  bundleTrackReleaseIds?: number[];
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

/** The membership of a bundle, in the shape `bundleConflict` needs. */
export type BundleRef = Pick<
  CartItem,
  "bundleId" | "bundleReleaseIds" | "bundleTrackIds" | "bundleTrackReleaseIds"
> & { bundleId: string };

export type Coverage =
  /** The exact item is in the cart. */
  | { kind: "self" }
  /** Granted by the whole-catalog purchase. */
  | { kind: "catalog" }
  /** Granted by a custom bundle already in the cart. */
  | { kind: "bundle"; bundleId: string; name: string };

/** What the items in a cart already grant. */
interface Grants {
  /** Releases granted whole, and with them every song on those releases. */
  releases: Set<number>;
  /** Individual songs granted by a bundle of songs. */
  tracks: Set<number>;
  /** The releases those songs came from. Overlap detection only — see `bundleConflict`. */
  trackReleases: Set<number>;
}

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

function grantsOf(items: CartItem[]): Grants {
  const grants: Grants = {
    releases: new Set<number>(),
    tracks: new Set<number>(),
    trackReleases: new Set<number>(),
  };
  for (const item of items) {
    if (!item.bundleId) continue;
    for (const id of item.bundleReleaseIds ?? []) grants.releases.add(id);
    for (const id of item.bundleTrackIds ?? []) grants.tracks.add(id);
    for (const id of item.bundleTrackReleaseIds ?? []) grants.trackReleases.add(id);
  }
  return grants;
}

/** Every release id granted whole by a bundle currently in the cart. */
export function coveredReleaseIds(items: CartItem[]): Set<number> {
  return grantsOf(items).releases;
}

/** Every individual song id granted by a bundle of songs currently in the cart. */
export function coveredTrackIds(items: CartItem[]): Set<number> {
  return grantsOf(items).tracks;
}

/** The bundle in the cart that already grants this release or song, if any. */
function grantingItem(items: CartItem[], ref: CartItemRef): CartItem | undefined {
  if (ref.trackId != null) {
    const bySong = items.find((i) => i.bundleTrackIds?.includes(ref.trackId!));
    if (bySong) return bySong;
  }
  const release = ref.releaseId ?? ref.parentReleaseId;
  if (release == null) return undefined;
  return items.find((i) => i.bundleReleaseIds?.includes(release));
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
  // A bundle is never "included in" another bundle — a partial overlap is a
  // conflict, not coverage. `bundleConflict` speaks to that case.
  if (ref.bundleId) return null;

  const owner = grantingItem(items, ref);
  return owner?.bundleId ? { kind: "bundle", bundleId: owner.bundleId, name: owner.name } : null;
}

export function isItemInCart(items: CartItem[], ref: CartItemRef): boolean {
  return coverageOf(items, ref) !== null;
}

/**
 * Why a bundle can't be added: the catalog already covers everything, or one
 * of its members is already granted by another bundle in the cart.
 *
 * Overlap is rejected rather than merged because the two bundles have
 * independent discounts — there's no honest single price for the union.
 *
 * A bundle of releases and a bundle of songs overlap when the songs come from
 * one of the releases: buying the release buys its songs, so the customer
 * would pay for those twice.
 */
export function bundleConflict(
  items: CartItem[],
  bundle: BundleRef,
): "catalog" | "overlap" | null {
  if (hasCatalog(items)) return "catalog";

  const granted = grantsOf(items.filter((i) => i.bundleId !== bundle.bundleId));
  const releaseIds = bundle.bundleReleaseIds ?? [];
  const trackIds = bundle.bundleTrackIds ?? [];
  const trackReleaseIds = bundle.bundleTrackReleaseIds ?? [];

  const overlaps =
    // A release this bundle grants whole is already granted whole, or has one
    // of its songs granted by a bundle of songs.
    releaseIds.some((id) => granted.releases.has(id) || granted.trackReleases.has(id)) ||
    // A song this bundle grants is already granted individually…
    trackIds.some((id) => granted.tracks.has(id)) ||
    // …or wholesale, via its release. Two bundles of songs drawing from the
    // same release are fine as long as they share no song, which is why this
    // checks `releases` and not `trackReleases`.
    trackReleaseIds.some((id) => granted.releases.has(id));

  return overlaps ? "overlap" : null;
}

/** The bundle membership of a cart item, for `bundleConflict`. */
function bundleRefOf(item: CartItem, bundleId: string): BundleRef {
  return {
    bundleId,
    bundleReleaseIds: item.bundleReleaseIds,
    bundleTrackIds: item.bundleTrackIds,
    bundleTrackReleaseIds: item.bundleTrackReleaseIds,
  };
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
    if (bundleConflict(items, bundleRefOf(item, item.bundleId))) return items;

    // Absorb anything the bundle now grants: member releases, tracks belonging
    // to a member release, and member songs.
    const memberReleases = new Set(item.bundleReleaseIds ?? []);
    const memberTracks = new Set(item.bundleTrackIds ?? []);
    return [
      ...items.filter((i) => {
        if (i.releaseId != null && memberReleases.has(i.releaseId)) return false;
        if (i.parentReleaseId != null && memberReleases.has(i.parentReleaseId)) return false;
        if (i.trackId != null && memberTracks.has(i.trackId)) return false;
        return true;
      }),
      item,
    ];
  }

  const granted = grantsOf(items);
  if (item.trackId != null && granted.tracks.has(item.trackId)) return items;
  const release = item.releaseId ?? item.parentReleaseId;
  if (release != null && granted.releases.has(release)) return items;

  return [...items, item];
}

/** Remove by identity. Removing a bundle does not restore the lines it absorbed. */
export function removeCartItem(items: CartItem[], ref: CartItemRef): CartItem[] {
  const key = cartItemKey(ref);
  return items.filter((i) => cartItemKey(i) !== key);
}
