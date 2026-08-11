/**
 * Bundle admin API. Auth defaults to authed via the global mock in
 * tests/setup.ts. The interesting cases are the validation rejections — a bad
 * bundle saved here becomes a wrong price at checkout.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { GET, PUT } from "@/app/api/admin/bundles/route";
import { PUT as putSetting } from "@/app/api/admin/settings/route";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getBundlesConfig } from "@/lib/bundles";
import { RELEASES_TAG } from "@/lib/cache-tags";
import { CATALOG_DISCOUNT_KEY } from "@/lib/constants";
import { makeRelease } from "../../factories";

function jsonRequest(body: unknown): NextRequest {
  return new Request("http://test/api/admin/bundles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function validBundle(releaseIds: number[], overrides: Record<string, unknown> = {}) {
  return {
    id: "summer",
    name: "Summer Pack",
    releaseIds,
    discountPercent: 20,
    published: true,
    ...overrides,
  };
}

describe("GET /api/admin/bundles", () => {
  it("returns the config plus published releases for the picker", async () => {
    const a = await makeRelease({ name: "Alpha", price: 1000 });
    await makeRelease({ name: "Hidden", isPublished: false });

    const body = await (await GET()).json();
    expect(body.config).toEqual({ bundles: [] });
    expect(body.releases.map((r: { id: number }) => r.id)).toEqual([a.id]);
  });

  it("401s when unauthenticated", async () => {
    vi.mocked(verifyAdminSession).mockResolvedValueOnce(false);
    expect((await GET()).status).toBe(401);
  });
});

describe("PUT /api/admin/bundles", () => {
  it("saves a valid config and revalidates the releases tag", async () => {
    const a = await makeRelease({ price: 1000 });
    const b = await makeRelease({ price: 2000 });
    vi.mocked(revalidateTag).mockClear();

    const res = await PUT(jsonRequest({ bundles: [validBundle([a.id, b.id])] }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.bundles).toHaveLength(1);
    expect(body.bundles[0].discountedPrice).toBe(2400);
    expect(await getBundlesConfig()).toEqual({
      bundles: [validBundle([a.id, b.id])],
    });
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RELEASES_TAG, "max");
  });

  it("rejects a bundle with fewer than two releases", async () => {
    const a = await makeRelease();
    const res = await PUT(jsonRequest({ bundles: [validBundle([a.id])] }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate releases within a bundle", async () => {
    const a = await makeRelease();
    const res = await PUT(jsonRequest({ bundles: [validBundle([a.id, a.id])] }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate bundle ids", async () => {
    const a = await makeRelease();
    const b = await makeRelease();
    const res = await PUT(
      jsonRequest({ bundles: [validBundle([a.id, b.id]), validBundle([b.id, a.id])] }),
    );
    expect(res.status).toBe(400);
  });

  it.each([-1, 96, 12.5])("rejects an out-of-range discount (%s)", async (discountPercent) => {
    const a = await makeRelease();
    const b = await makeRelease();
    const res = await PUT(
      jsonRequest({ bundles: [validBundle([a.id, b.id], { discountPercent })] }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects members that are not published", async () => {
    const a = await makeRelease();
    const hidden = await makeRelease({ isPublished: false });
    const res = await PUT(jsonRequest({ bundles: [validBundle([a.id, hidden.id])] }));

    expect(res.status).toBe(400);
    expect((await res.json()).unknownIds).toEqual([hidden.id]);
  });

  it("401s when unauthenticated", async () => {
    vi.mocked(verifyAdminSession).mockResolvedValueOnce(false);
    expect((await PUT(jsonRequest({ bundles: [] }))).status).toBe(401);
  });

  it("round-trips a saved config through GET", async () => {
    const a = await makeRelease({ price: 500 });
    const b = await makeRelease({ price: 500 });
    await PUT(jsonRequest({ bundles: [validBundle([a.id, b.id])] }));

    const body = await (await GET()).json();
    expect(body.config.bundles[0].name).toBe("Summer Pack");
  });
});

describe("PUT /api/admin/settings", () => {
  it("revalidates the releases tag when the catalog discount changes", async () => {
    vi.mocked(revalidateTag).mockClear();
    const req = new Request("http://test/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: CATALOG_DISCOUNT_KEY, value: "25" }),
    }) as NextRequest;

    expect((await putSetting(req)).status).toBe(200);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RELEASES_TAG, "max");
  });

  it("does not revalidate for unrelated keys", async () => {
    vi.mocked(revalidateTag).mockClear();
    const req = new Request("http://test/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "some_other_key", value: "x" }),
    }) as NextRequest;

    expect((await putSetting(req)).status).toBe(200);
    expect(vi.mocked(revalidateTag)).not.toHaveBeenCalled();
  });
});
