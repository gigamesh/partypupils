/**
 * Bundle resolution against the published catalog. The properties that matter
 * are the degradations: a bundle referencing a release that was unpublished or
 * deleted must quietly shrink (or disappear) rather than break `/music`.
 */
import { describe, it, expect } from "vitest";
import { getBundlesConfig, getBundleForCheckout, getPublishedBundles } from "@/lib/bundles";
import { queries } from "@/lib/db";
import { BUNDLES_SETTING_KEY } from "@/lib/constants";
import type { Bundle } from "@/lib/bundle-schema";
import { makeRelease } from "../factories";

function bundle(overrides: Partial<Bundle> & { releaseIds: number[] }): Bundle {
  return {
    id: overrides.id ?? "b1",
    name: overrides.name ?? "Test Bundle",
    description: overrides.description,
    releaseIds: overrides.releaseIds,
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
    expect(resolved!.releaseIds).toEqual([a.id, b.id]);
    expect(resolved!.originalPrice).toBe(2000);
  });

  it("drops member ids that no longer exist", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 1000 });
    await storeBundles([bundle({ releaseIds: [a.id, 999999, b.id] })]);

    const [resolved] = await getPublishedBundles();
    expect(resolved!.releaseIds).toEqual([a.id, b.id]);
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
