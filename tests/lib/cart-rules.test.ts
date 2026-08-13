/**
 * Cart semantics. The property under test throughout is that a customer can
 * never end up paying twice for the same release or song.
 */
import { describe, it, expect } from "vitest";
import {
  addCartItem,
  bundleConflict,
  cartItemKey,
  coverageOf,
  coveredReleaseIds,
  coveredTrackIds,
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

/** A bundle of songs. `members` is `[trackId, parentReleaseId]` pairs. */
function songBundle(id: string, members: [number, number][]): CartItem {
  return {
    bundleId: id,
    bundleTrackIds: members.map(([trackId]) => trackId),
    bundleTrackReleaseIds: [...new Set(members.map(([, releaseId]) => releaseId))],
    name: `Singles ${id}`,
    slug: "",
    price: 500,
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

  it("does not count the releases a bundle of songs draws from", () => {
    // The bundle grants songs 10 and 11, not release 1 whole.
    const items = [songBundle("s1", [[10, 1], [11, 1]])];
    expect(coveredReleaseIds(items).size).toBe(0);
    expect([...coveredTrackIds(items)].sort()).toEqual([10, 11]);
  });
});

describe("bundles of songs", () => {
  it("absorbs member songs already in the cart", () => {
    const items = [track(10, 1), track(11, 2), track(12, 3)];
    const next = addCartItem(items, songBundle("s1", [[10, 1], [11, 2]]));

    expect(next.map(cartItemKey)).toEqual(["track-12", "bundle-s1"]);
  });

  it("leaves the rest of a member's release for sale", () => {
    // Only song 10 of release 1 is in the bundle, so its sibling and the
    // release itself are still purchasable.
    const items = addCartItem([], songBundle("s1", [[10, 1], [20, 2]]));
    const next = addCartItem(items, track(11, 1));

    expect(next.map(cartItemKey)).toEqual(["bundle-s1", "track-11"]);
    expect(coverageOf(next, release(1))).toBeNull();
  });

  it("blocks a member song and reports which bundle grants it", () => {
    const items = addCartItem([], songBundle("s1", [[10, 1], [20, 2]]));

    expect(addCartItem(items, track(10, 1))).toBe(items);
    expect(coverageOf(items, track(10, 1))).toEqual({
      kind: "bundle",
      bundleId: "s1",
      name: "Singles s1",
    });
  });

  it("allows two bundles of songs drawing from the same release", () => {
    const items = addCartItem([], songBundle("s1", [[10, 1], [11, 1]]));
    const next = addCartItem(items, songBundle("s2", [[12, 1], [13, 1]]));

    expect(next.map(cartItemKey)).toEqual(["bundle-s1", "bundle-s2"]);
  });

  it("rejects two bundles of songs sharing a song", () => {
    const items = addCartItem([], songBundle("s1", [[10, 1], [11, 1]]));

    expect(addCartItem(items, songBundle("s2", [[11, 1], [12, 1]]))).toBe(items);
  });

  it("rejects a bundle of songs whose release another bundle already grants whole", () => {
    const items = addCartItem([], bundle("b1", [1, 2]));
    const singles = songBundle("s1", [[10, 1], [20, 9]]);

    expect(addCartItem(items, singles)).toBe(items);
    expect(
      bundleConflict(items, {
        bundleId: "s1",
        bundleTrackIds: singles.bundleTrackIds,
        bundleTrackReleaseIds: singles.bundleTrackReleaseIds,
      }),
    ).toBe("overlap");
  });

  it("rejects a bundle of releases when a bundle of songs holds one of their songs", () => {
    // The mirror of the case above — order of adding shouldn't decide whether
    // the customer gets charged twice for song 10.
    const items = addCartItem([], songBundle("s1", [[10, 1], [20, 9]]));

    expect(addCartItem(items, bundle("b1", [1, 2]))).toBe(items);
    expect(bundleConflict(items, { bundleId: "b1", bundleReleaseIds: [1, 2] })).toBe("overlap");
  });

  it("is covered by the catalog like any other bundle", () => {
    const items = [catalog];
    const singles = songBundle("s1", [[10, 1], [11, 2]]);

    expect(addCartItem(items, singles)).toBe(items);
    expect(
      bundleConflict(items, {
        bundleId: "s1",
        bundleTrackIds: singles.bundleTrackIds,
        bundleTrackReleaseIds: singles.bundleTrackReleaseIds,
      }),
    ).toBe("catalog");
  });

  it("is not treated as covered by a release bundle it merely overlaps", () => {
    // Overlap is a conflict, not coverage — the card says "overlaps a bundle
    // in your cart" rather than offering an inert "included in" button.
    const items = addCartItem([], bundle("b1", [1]));

    expect(coverageOf(items, { bundleId: "s1" })).toBeNull();
  });
});
