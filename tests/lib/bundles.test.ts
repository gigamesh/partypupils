/**
 * Bundle resolution against the published catalog. The properties that matter
 * are the degradations: a bundle referencing a release (or song) that was
 * unpublished or deleted must quietly shrink — or disappear — rather than
 * break `/music`.
 */
import { describe, it, expect } from "vitest";
import {
  bundleProductName,
  getBundlesConfig,
  getBundleForCheckout,
  getPublishedBundles,
} from "@/lib/bundles";
import { queries } from "@/lib/db";
import { BUNDLES_SETTING_KEY } from "@/lib/constants";
import type { Bundle, ReleaseBundle, TrackBundle } from "@/lib/bundle-schema";
import { makeRelease, makeTrackWithFile } from "../factories";

type BundleDefaults = Partial<Omit<Bundle, "kind" | "releaseIds" | "trackIds">>;

function bundle(overrides: BundleDefaults & { releaseIds: number[] }): ReleaseBundle {
  return {
    id: overrides.id ?? "b1",
    name: overrides.name ?? "Test Bundle",
    description: overrides.description,
    kind: "releases",
    releaseIds: overrides.releaseIds,
    discountPercent: overrides.discountPercent ?? 20,
    published: overrides.published ?? true,
  };
}

function songBundle(overrides: BundleDefaults & { trackIds: number[] }): TrackBundle {
  return {
    id: overrides.id ?? "b1",
    name: overrides.name ?? "Test Singles",
    description: overrides.description,
    kind: "tracks",
    trackIds: overrides.trackIds,
    discountPercent: overrides.discountPercent ?? 20,
    published: overrides.published ?? true,
  };
}

async function storeBundles(bundles: Bundle[]) {
  await queries.setSetting(BUNDLES_SETTING_KEY, { bundles });
}

describe("getBundlesConfig", () => {
  it("returns an empty config when the setting is missing", async () => {
    expect(await getBundlesConfig()).toEqual({ bundles: [] });
  });

  it("degrades to an empty config when the stored value fails validation", async () => {
    await queries.setSetting(BUNDLES_SETTING_KEY, { bundles: [{ id: "x" }] });
    expect(await getBundlesConfig()).toEqual({ bundles: [] });
  });

  it("reads a bundle stored before `kind` existed as a release bundle", async () => {
    await queries.setSetting(BUNDLES_SETTING_KEY, {
      bundles: [
        {
          id: "legacy",
          name: "Legacy Pack",
          releaseIds: [1, 2],
          discountPercent: 20,
          published: true,
        },
      ],
    });

    const [stored] = (await getBundlesConfig()).bundles;
    expect(stored).toMatchObject({ kind: "releases", releaseIds: [1, 2] });
  });
});

describe("getPublishedBundles", () => {
  it("prices a bundle off its member releases", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 2000 });
    await storeBundles([bundle({ releaseIds: [a.id, b.id], discountPercent: 20 })]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.originalPrice).toBe(3000);
    expect(resolved!.discountedPrice).toBe(2400);
    expect(resolved!.members.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("preserves the admin-specified member order", async () => {
    const a = await makeRelease({ name: "A", price: 500 });
    const b = await makeRelease({ name: "B", price: 500 });
    const c = await makeRelease({ name: "C", price: 500 });
    await storeBundles([bundle({ releaseIds: [c.id, a.id, b.id] })]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.members.map((m) => m.name)).toEqual(["C", "A", "B"]);
  });

  it("drops unpublished members but keeps the bundle", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    const hidden = await makeRelease({ price: 5000, isPublished: false });
    await storeBundles([
      bundle({ releaseIds: [a.id, hidden.id, b.id], discountPercent: 0 }),
    ]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.members.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(resolved!.originalPrice).toBe(2000);
  });

  it("drops member ids that no longer exist", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundles([bundle({ releaseIds: [a.id, 999999, b.id] })]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.members.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it("hides a bundle that falls below two resolvable members", async () => {
    const a = await makeRelease({ price: 1000 });
    const hidden = await makeRelease({ price: 1000, isPublished: false });
    await storeBundles([bundle({ releaseIds: [a.id, hidden.id] })]);

    expect(await getPublishedBundles()).toEqual([]);
  });

  it("hides unpublished bundles", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundles([bundle({ releaseIds: [a.id, b.id], published: false })]);

    expect(await getPublishedBundles()).toEqual([]);
  });

  it("returns bundles in config order", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundles([
      bundle({ id: "second", name: "Second", releaseIds: [a.id, b.id] }),
      bundle({ id: "first", name: "First", releaseIds: [b.id, a.id] }),
    ]);

    expect((await getPublishedBundles()).map((x) => x.name)).toEqual(["Second", "First"]);
  });
});

describe("getPublishedBundles — bundles of songs", () => {
  it("prices a bundle off its member songs, not their releases", async () => {
    const release = await makeRelease({ price: 5000, coverImageUrl: "/cover.jpg" });
    const one = await makeTrackWithFile(release.id, { price: 150, trackNumber: 1 });
    const two = await makeTrackWithFile(release.id, { price: 250, trackNumber: 2 });
    await storeBundles([songBundle({ trackIds: [one.id, two.id], discountPercent: 25 })]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.kind).toBe("tracks");
    expect(resolved!.originalPrice).toBe(400);
    expect(resolved!.discountedPrice).toBe(300);
    expect(resolved!.members.map((m) => m.id)).toEqual([one.id, two.id]);
  });

  it("draws songs from across the catalog and dedupes the cover stack", async () => {
    const first = await makeRelease({ coverImageUrl: "/first.jpg" });
    const second = await makeRelease({ coverImageUrl: "/second.jpg" });
    const a = await makeTrackWithFile(first.id, { price: 150, trackNumber: 1 });
    const b = await makeTrackWithFile(first.id, { price: 150, trackNumber: 2 });
    const c = await makeTrackWithFile(second.id, { price: 150, trackNumber: 1 });
    await storeBundles([songBundle({ trackIds: [a.id, b.id, c.id] })]);

    const [resolved] = await getPublishedBundles();
    // Two songs share a release, so its cover appears once rather than twice.
    expect(resolved!.coverImageUrls).toEqual(["/first.jpg", "/second.jpg"]);
    expect(resolved!.kind === "tracks" && resolved!.trackReleaseIds).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("drops songs whose release was unpublished", async () => {
    const live = await makeRelease();
    const hidden = await makeRelease({ isPublished: false });
    const a = await makeTrackWithFile(live.id, { price: 150, trackNumber: 1 });
    const b = await makeTrackWithFile(live.id, { price: 150, trackNumber: 2 });
    const gone = await makeTrackWithFile(hidden.id, { price: 150, trackNumber: 1 });
    await storeBundles([
      songBundle({ trackIds: [a.id, gone.id, b.id], discountPercent: 0 }),
    ]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.members.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(resolved!.originalPrice).toBe(300);
  });

  it("hides a bundle that falls below two resolvable songs", async () => {
    const release = await makeRelease();
    const only = await makeTrackWithFile(release.id, { price: 150 });
    await storeBundles([songBundle({ trackIds: [only.id, 999999] })]);

    expect(await getPublishedBundles()).toEqual([]);
  });

  it("names the Stripe line item in songs", async () => {
    const release = await makeRelease();
    const a = await makeTrackWithFile(release.id, { price: 150, trackNumber: 1 });
    const b = await makeTrackWithFile(release.id, { price: 150, trackNumber: 2 });
    await storeBundles([
      songBundle({ id: "singles", name: "Club Cuts", trackIds: [a.id, b.id], discountPercent: 20 }),
    ]);

    const resolved = await getBundleForCheckout("singles");
    expect(bundleProductName(resolved!)).toBe("Club Cuts (2 songs, 20% off)");
  });
});

describe("getBundleForCheckout", () => {
  it("resolves a published bundle by id", async () => {
    const a = await makeRelease({ price: 1500 });
    const b = await makeRelease({ price: 1500 });
    await storeBundles([bundle({ id: "summer", releaseIds: [a.id, b.id], discountPercent: 10 })]);

    const resolved = await getBundleForCheckout("summer");
    expect(resolved?.discountedPrice).toBe(2700);
  });

  it("returns undefined for an unknown or hidden bundle", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundles([bundle({ id: "hidden", releaseIds: [a.id, b.id], published: false })]);

    expect(await getBundleForCheckout("hidden")).toBeUndefined();
    expect(await getBundleForCheckout("nope")).toBeUndefined();
  });
});
