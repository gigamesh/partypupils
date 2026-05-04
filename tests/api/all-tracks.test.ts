/**
 * Tests for the radio queue endpoint and the admin tag-invalidation wiring.
 *
 * The actual cache layer (`unstable_cache`) is mocked away in setup so each
 * call hits Prisma directly — these tests cover the data shape (filtering,
 * `toPlayerTrack` mapping) and the contract that admin writes call
 * `revalidateTag("radio-tracks")` so cached responses get purged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { GET as getAllTracks, RADIO_TRACKS_TAG } from "@/app/api/all-tracks/route";
import { POST as createRelease } from "@/app/api/admin/releases/route";
import {
  PUT as updateRelease,
  PATCH as patchRelease,
  DELETE as deleteRelease,
} from "@/app/api/admin/releases/[id]/route";
import { makeRelease, makeTrackWithFile } from "../factories";

beforeEach(() => {
  vi.mocked(revalidateTag).mockReset();
});

function jsonRequest(method: string, body: unknown): NextRequest {
  return new Request("http://test/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe("GET /api/all-tracks", () => {
  it("returns published+inRadio releases with their inRadio tracks", async () => {
    const r = await makeRelease({ slug: "in-radio" });
    await makeTrackWithFile(r.id, { name: "T1" });

    const res = await getAllTracks();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].trackName).toBe("T1");
    expect(data.tracks[0].releaseSlug).toBe("in-radio");
  });

  it("excludes unpublished releases", async () => {
    const r = await makeRelease({ slug: "draft", isPublished: false });
    await makeTrackWithFile(r.id);

    const res = await getAllTracks();
    const data = await res.json();
    expect(data.tracks).toHaveLength(0);
  });

  it("excludes releases with inRadio=false", async () => {
    const r = await makeRelease({ slug: "off-air" });
    await makeTrackWithFile(r.id);
    await import("@/lib/db").then(({ prisma }) =>
      prisma.release.update({ where: { id: r.id }, data: { inRadio: false } }),
    );

    const res = await getAllTracks();
    const data = await res.json();
    expect(data.tracks).toHaveLength(0);
  });

  it("excludes individual tracks with inRadio=false", async () => {
    const r = await makeRelease({ slug: "mixed" });
    const tOn = await makeTrackWithFile(r.id, { name: "On", trackNumber: 1 });
    const tOff = await makeTrackWithFile(r.id, { name: "Off", trackNumber: 2 });
    await import("@/lib/db").then(({ prisma }) =>
      prisma.track.update({ where: { id: tOff.id }, data: { inRadio: false } }),
    );

    const res = await getAllTracks();
    const data = await res.json();
    const ids = data.tracks.map((t: { trackId: number }) => t.trackId);
    expect(ids).toEqual([tOn.id]);
  });

  it("returns the response un-shuffled (callers shuffle client-side)", async () => {
    const r = await makeRelease({ slug: "ordered" });
    await makeTrackWithFile(r.id, { name: "B", trackNumber: 2 });
    await makeTrackWithFile(r.id, { name: "A", trackNumber: 1 });

    const res = await getAllTracks();
    const data = await res.json();
    // Tracks are ordered by trackNumber asc inside each release, not shuffled.
    expect(data.tracks.map((t: { trackName: string }) => t.trackName)).toEqual(["A", "B"]);
  });
});

describe("admin mutations invalidate the radio-tracks cache tag", () => {
  it("POST /api/admin/releases calls revalidateTag(radio-tracks)", async () => {
    const res = await createRelease(
      jsonRequest("POST", {
        name: "Inv",
        slug: "inv-post",
        price: 100,
        type: "single",
        isPublished: true,
        tracks: [],
      }),
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RADIO_TRACKS_TAG, "max");
  });

  it("PUT /api/admin/releases/[id] calls revalidateTag(radio-tracks)", async () => {
    const release = await makeRelease({ slug: "inv-put" });
    const t = await makeTrackWithFile(release.id);

    await updateRelease(
      jsonRequest("PUT", {
        name: release.name,
        slug: release.slug,
        description: null,
        price: release.price,
        type: release.type,
        coverImageUrl: null,
        releasedAt: null,
        isPublished: release.isPublished,
        tracks: [
          {
            id: t.id,
            name: t.name,
            price: t.price,
            trackNumber: 1,
            files: t.files.map((f) => ({
              format: f.format,
              fileName: f.fileName,
              storageKey: f.storageKey,
              fileSize: f.fileSize ?? 0,
            })),
          },
        ],
      }),
      ctx(release.id),
    );
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RADIO_TRACKS_TAG, "max");
  });

  it("PATCH /api/admin/releases/[id] calls revalidateTag when inRadio toggles", async () => {
    const release = await makeRelease({ slug: "inv-patch-radio" });
    await patchRelease(jsonRequest("PATCH", { inRadio: false }), ctx(release.id));
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RADIO_TRACKS_TAG, "max");
  });

  it("PATCH /api/admin/releases/[id] calls revalidateTag when isPublished toggles", async () => {
    const release = await makeRelease({ slug: "inv-patch-pub" });
    await patchRelease(jsonRequest("PATCH", { isPublished: false }), ctx(release.id));
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RADIO_TRACKS_TAG, "max");
  });

  it("DELETE /api/admin/releases/[id] calls revalidateTag(radio-tracks)", async () => {
    const release = await makeRelease({ slug: "inv-del" });
    await deleteRelease(
      new Request("http://test", { method: "DELETE" }) as unknown as NextRequest,
      ctx(release.id),
    );
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith(RADIO_TRACKS_TAG, "max");
  });
});
