/**
 * Cart semantics. The property under test throughout is that a customer can
 * never end up paying twice for the same release.
 */
import { describe, it, expect } from "vitest";
import {
  addCartItem,
  bundleConflict,
  cartItemKey,
  coverageOf,
  coveredReleaseIds,
  isItemInCart,
  removeCartItem,
  type CartItem,
} from "@/lib/cart-rules";

function release(id: number): CartItem {
  return {
    releaseId: id,
    name: `Release ${id}`,
    slug: `release-${id}`,
    price: 1000,
    coverImageUrl: null,
  };
}

function track(id: number, parentReleaseId: number): CartItem {
  return {
    trackId: id,
    parentReleaseId,
    name: `Track ${id}`,
    slug: `release-${parentReleaseId}`,
    price: 150,
    coverImageUrl: null,
  };
}

function bundle(id: string, releaseIds: number[]): CartItem {
  return {
    bundleId: id,
    bundleReleaseIds: releaseIds,
    name: `Bundle ${id}`,
    slug: "",
    price: 2000,
    coverImageUrl: null,
  };
}

const catalog: CartItem = {
  catalogPurchase: true,
  name: "Complete Catalog",
  slug: "",
  price: 5000,
  coverImageUrl: null,
};

describe("cartItemKey", () => {
  it("gives each kind a distinct namespace", () => {
    expect(cartItemKey(catalog)).toBe("catalog");
    expect(cartItemKey(bundle("b1", [1]))).toBe("bundle-b1");
    expect(cartItemKey(release(7))).toBe("release-7");
    expect(cartItemKey(track(7, 3))).toBe("track-7");
  });

  it("keeps a track distinct from its parent release", () => {
    // Both reference release 3; without the branch order these would collide.
    expect(cartItemKey(track(3, 3))).not.toBe(cartItemKey(release(3)));
  });
});

describe("adding a bundle", () => {
  it("absorbs member releases already in the cart", () => {
    const items = [release(1), release(2), release(9)];
    const next = addCartItem(items, bundle("b1", [1, 2]));

    expect(next.map(cartItemKey)).toEqual(["release-9", "bundle-b1"]);
  });

  it("absorbs tracks belonging to member releases", () => {
    const items = [track(10, 1), track(11, 9)];
    const next = addCartItem(items, bundle("b1", [1, 2]));

    expect(next.map(cartItemKey)).toEqual(["track-11", "bundle-b1"]);
  });

  it("allows two bundles with no releases in common", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    const next = addCartItem(items, bundle("b2", [3, 4]));

    expect(next.map(cartItemKey)).toEqual(["bundle-b1", "bundle-b2"]);
  });

  it("rejects a bundle overlapping one already in the cart", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    const next = addCartItem(items, bundle("b2", [2, 3]));

    expect(next).toBe(items);
    expect(bundleConflict(items, { bundleId: "b2", bundleReleaseIds: [2, 3] })).toBe("overlap");
  });

  it("is a no-op when the same bundle is added twice", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    expect(addCartItem(items, bundle("b1", [1, 2]))).toBe(items);
  });

  it("is a no-op while the catalog is in the cart", () => {
    const items = [catalog];
    expect(addCartItem(items, bundle("b1", [1, 2]))).toBe(items);
    expect(bundleConflict(items, { bundleId: "b1", bundleReleaseIds: [1, 2] })).toBe("catalog");
  });
});

describe("adding releases and tracks alongside a bundle", () => {
  it("blocks a release the bundle already grants", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    expect(addCartItem(items, release(1))).toBe(items);
  });

  it("blocks a track whose parent release the bundle grants", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    expect(addCartItem(items, track(10, 2))).toBe(items);
  });

  it("still allows unrelated releases and tracks", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    const withRelease = addCartItem(items, release(9));
    const withTrack = addCartItem(withRelease, track(10, 9));

    expect(withTrack.map(cartItemKey)).toEqual(["bundle-b1", "release-9", "track-10"]);
  });

  it("treats a legacy track with no parentReleaseId as uncovered", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    const legacy: CartItem = {
      trackId: 10,
      name: "Legacy",
      slug: "x",
      price: 150,
      coverImageUrl: null,
    };
    expect(addCartItem(items, legacy)).toHaveLength(2);
  });
});

describe("the catalog purchase", () => {
  it("replaces the whole cart", () => {
    const items = [release(1), bundle("b1", [2, 3])];
    expect(addCartItem(items, catalog)).toEqual([catalog]);
  });

  it("blocks every other add", () => {
    const items = [catalog];
    expect(addCartItem(items, release(1))).toBe(items);
    expect(addCartItem(items, track(10, 1))).toBe(items);
  });

  it("reports everything as covered", () => {
    const items = [catalog];
    expect(isItemInCart(items, release(1))).toBe(true);
    expect(isItemInCart(items, track(10, 1))).toBe(true);
    expect(coverageOf(items, release(1))).toEqual({ kind: "catalog" });
    expect(coverageOf(items, catalog)).toEqual({ kind: "self" });
  });
});

describe("coverageOf", () => {
  it("distinguishes a directly-added item from a bundle-granted one", () => {
    const items = [bundle("b1", [1, 2]), release(9)];

    expect(coverageOf(items, release(9))).toEqual({ kind: "self" });
    expect(coverageOf(items, release(1))).toEqual({
      kind: "bundle",
      bundleId: "b1",
      name: "Bundle b1",
    });
    expect(coverageOf(items, release(5))).toBeNull();
  });

  it("covers a track via its parent release", () => {
    const items = [bundle("b1", [1, 2])];
    expect(coverageOf(items, track(10, 2))).toMatchObject({ kind: "bundle", bundleId: "b1" });
  });
});

describe("removeCartItem", () => {
  it("removes a bundle without restoring the lines it absorbed", () => {
    const items = addCartItem([release(1)], bundle("b1", [1, 2]));
    expect(removeCartItem(items, { bundleId: "b1" })).toEqual([]);
  });

  it("removes only the matching line", () => {
    const items = [release(1), release(2)];
    expect(removeCartItem(items, { releaseId: 1 }).map(cartItemKey)).toEqual(["release-2"]);
  });
});

describe("coveredReleaseIds", () => {
  it("unions member ids across every bundle in the cart", () => {
    const items = [bundle("b1", [1, 2]), bundle("b2", [3])];
    expect([...coveredReleaseIds(items)].sort()).toEqual([1, 2, 3]);
  });

  it("ignores plain releases", () => {
    expect(coveredReleaseIds([release(1)]).size).toBe(0);
  });
});
