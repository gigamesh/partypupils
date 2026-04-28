/**
 * Tests for release/track persistence.
 *
 * Most tests exercise `syncReleaseAndTracks` directly — that's where the
 * interesting logic lives now (incremental diff + transactional apply).
 * A small integration band at the bottom drives the same code through the
 * Next route handler to confirm the wiring matches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST as createRelease } from "@/app/api/admin/releases/route";
import { PUT as updateRelease, DELETE as deleteRelease } from "@/app/api/admin/releases/[id]/route";
import { syncReleaseAndTracks } from "@/lib/release-tracks";
import { deleteFile } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { makeRelease, makeTrackWithFile, makeCompletedOrder } from "../../factories";

beforeEach(() => {
  vi.mocked(deleteFile).mockReset();
  vi.mocked(deleteFile).mockResolvedValue(undefined);
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

/** Map a Prisma TrackFile back into the FileInput shape the sync function expects. */
function asFileInput(f: { format: string; fileName: string; storageKey: string; fileSize: number | null }) {
  return { format: f.format, fileName: f.fileName, storageKey: f.storageKey, fileSize: f.fileSize ?? 0 };
}

import type { ReleaseScalarsInput } from "@/lib/release-tracks";

function scalarsFor(release: { name: string; slug: string; price: number; type: string; isPublished: boolean }): ReleaseScalarsInput {
  return {
    name: release.name,
    slug: release.slug,
    description: null,
    price: release.price,
    type: release.type as ReleaseScalarsInput["type"],
    coverImageUrl: null,
    releasedAt: null,
    isPublished: release.isPublished,
  };
}

describe("syncReleaseAndTracks", () => {
  it("preserves track IDs when only scalar fields change", async () => {
    const release = await makeRelease();
    const t1 = await makeTrackWithFile(release.id, { name: "Original 1", trackNumber: 1 });
    const t2 = await makeTrackWithFile(release.id, { name: "Original 2", trackNumber: 2 });

    await syncReleaseAndTracks(release.id, { ...scalarsFor(release), name: "Renamed" }, [
      { id: t1.id, name: "Renamed 1", price: t1.price, trackNumber: 1, files: t1.files.map(asFileInput) },
      { id: t2.id, name: t2.name, price: t2.price, trackNumber: 2, files: t2.files.map(asFileInput) },
    ]);

    const after = await prisma.release.findUnique({
      where: { id: release.id },
      include: { tracks: { orderBy: { trackNumber: "asc" } } },
    });
    expect(after?.name).toBe("Renamed");
    expect(after?.tracks.map((t) => t.id)).toEqual([t1.id, t2.id]);
    expect(after?.tracks[0].name).toBe("Renamed 1");
  });

  it("does NOT silently null OrderItem.trackId for tracks that survived the edit (the regression)", async () => {
    const release = await makeRelease();
    const t1 = await makeTrackWithFile(release.id, { name: "Bought" });
    await makeCompletedOrder({ email: "buyer@test", trackIds: [t1.id] });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t1.id, name: "Bought (renamed)", price: t1.price, trackNumber: 1, files: t1.files.map(asFileInput) },
    ]);

    const orderItem = await prisma.orderItem.findFirst({ where: { trackId: t1.id } });
    expect(orderItem?.trackId).toBe(t1.id);
  });

  it("deletes tracks absent from the payload", async () => {
    const release = await makeRelease();
    const keep = await makeTrackWithFile(release.id, { name: "Keep", trackNumber: 1 });
    const drop = await makeTrackWithFile(release.id, { name: "Drop", trackNumber: 2 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: keep.id, name: keep.name, price: keep.price, trackNumber: 1, files: keep.files.map(asFileInput) },
    ]);

    const remaining = await prisma.track.findMany({ where: { releaseId: release.id } });
    expect(remaining.map((t) => t.id)).toEqual([keep.id]);
    expect(await prisma.track.findUnique({ where: { id: drop.id } })).toBeNull();
  });

  it("creates new tracks (entries without an id)", async () => {
    const release = await makeRelease();
    const existing = await makeTrackWithFile(release.id, { name: "Existing", trackNumber: 1 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: existing.id, name: existing.name, price: existing.price, trackNumber: 1, files: existing.files.map(asFileInput) },
      { name: "Brand new", price: 200, trackNumber: 2, files: [{ format: "mp3", fileName: "new.mp3", storageKey: "https://r2/new.mp3", fileSize: 5 }] },
    ]);

    const tracks = await prisma.track.findMany({
      where: { releaseId: release.id },
      orderBy: { trackNumber: "asc" },
    });
    expect(tracks.map((t) => t.name)).toEqual(["Existing", "Brand new"]);
    expect(tracks[0].id).toBe(existing.id);
    expect(tracks[1].id).not.toBe(existing.id);
  });

  it("does NOT churn TrackFile rows when (format, storageKey) is unchanged", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const fileIdBefore = t.files[0].id;

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: "renamed scalar", price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
    ]);

    const after = await prisma.trackFile.findFirst({ where: { trackId: t.id } });
    expect(after?.id).toBe(fileIdBefore);
  });

  it("replaces TrackFile rows when storageKey changes (new audio uploaded)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const fileIdBefore = t.files[0].id;

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      {
        id: t.id,
        name: t.name,
        price: t.price,
        trackNumber: 1,
        files: [{ format: "mp3", fileName: "newer.mp3", storageKey: "https://r2/newer.mp3", fileSize: 99 }],
      },
    ]);

    const after = await prisma.trackFile.findMany({ where: { trackId: t.id } });
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(fileIdBefore);
    expect(after[0].storageKey).toBe("https://r2/newer.mp3");
  });

  it("rolls back the entire update if any operation fails", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const collision = await makeRelease({ slug: "collides" });

    const failed = await syncReleaseAndTracks(
      release.id,
      { ...scalarsFor(release), slug: collision.slug }, // slug already taken
      [],
    ).catch((e) => e);

    expect(failed).toBeInstanceOf(Error);

    // @prisma/adapter-pg leaves the pooled connection in an "aborted transaction" state after
    // a failed $transaction; subsequent queries fail with a misleading bind-mismatch error.
    // Force a reconnect so the post-failure assertions hit a clean connection.
    await prisma.$disconnect();

    // Track survives (delete-all-because-tracks-empty must NOT have committed).
    expect(await prisma.track.findUnique({ where: { id: t.id } })).not.toBeNull();
    // Release name unchanged.
    expect((await prisma.release.findUnique({ where: { id: release.id } }))?.name).toBe(release.name);
  });

  it("reorders tracks (same IDs, different trackNumber values)", async () => {
    const release = await makeRelease();
    const a = await makeTrackWithFile(release.id, { name: "A", trackNumber: 1 });
    const b = await makeTrackWithFile(release.id, { name: "B", trackNumber: 2 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: b.id, name: b.name, price: b.price, trackNumber: 1, files: b.files.map(asFileInput) },
      { id: a.id, name: a.name, price: a.price, trackNumber: 2, files: a.files.map(asFileInput) },
    ]);

    const sorted = await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } });
    expect(sorted.map((t) => t.name)).toEqual(["B", "A"]);
    expect(sorted.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("cleans up R2 objects when tracks are deleted (best-effort, after the DB commit)", async () => {
    const release = await makeRelease();
    const keep = await makeTrackWithFile(release.id, { name: "Keep", trackNumber: 1 });
    const drop = await makeTrackWithFile(release.id, {
      name: "Drop",
      trackNumber: 2,
      storageKey: "https://r2/dropped.mp3",
    });
    // Add a previewUrl on the dropped track so we exercise that branch too.
    await prisma.track.update({
      where: { id: drop.id },
      data: { previewUrl: "https://r2/dropped-preview.mp3" },
    });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: keep.id, name: keep.name, price: keep.price, trackNumber: 1, files: keep.files.map(asFileInput) },
    ]);

    const calls = vi.mocked(deleteFile).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(["https://r2/dropped-preview.mp3", "https://r2/dropped.mp3"]);
  });

  it("does not call deleteFile when no tracks were deleted", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: "renamed", price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
    ]);

    expect(vi.mocked(deleteFile)).not.toHaveBeenCalled();
  });

  it("ignores stray ids that don't belong to this release (treats them as deletions)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Real" });
    // Payload references id 99999 which doesn't exist — should be filtered out, not crash.

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: t.name, price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
      { id: 99999, name: "Phantom", price: 0, trackNumber: 2, files: [] }, // stray
    ]);

    const tracks = await prisma.track.findMany({ where: { releaseId: release.id } });
    // Only the real track survives; the stray id was silently dropped (it's not in existingById).
    expect(tracks.map((t) => t.id)).toEqual([t.id]);
  });
});

describe("POST /api/admin/releases", () => {
  it("creates a release with tracks and nested files", async () => {
    const res = await createRelease(
      jsonRequest("POST", {
        name: "Album One",
        slug: "album-one",
        price: 1500,
        type: "album",
        isPublished: true,
        tracks: [
          { name: "T1", price: 150, trackNumber: 1, files: [{ format: "mp3", fileName: "a.mp3", storageKey: "https://r2/a.mp3", fileSize: 10 }] },
          { name: "T2", price: 150, trackNumber: 2, files: [{ format: "mp3", fileName: "b.mp3", storageKey: "https://r2/b.mp3", fileSize: 10 }] },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const created = await prisma.release.findUnique({
      where: { slug: "album-one" },
      include: { tracks: { include: { files: true }, orderBy: { trackNumber: "asc" } } },
    });
    expect(created?.tracks).toHaveLength(2);
    expect(created?.tracks[0].files).toHaveLength(1);
  });

  it("rejects duplicate slug with 400", async () => {
    await makeRelease({ slug: "dup" });
    const res = await createRelease(
      jsonRequest("POST", { name: "Dup", slug: "dup", price: 100, type: "single", isPublished: false, tracks: [] }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT/DELETE /api/admin/releases/[id] (route wiring)", () => {
  it("PUT routes through to syncReleaseAndTracks (smoke test for handler glue)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Original" });

    const res = await updateRelease(
      jsonRequest("PUT", {
        ...scalarsFor(release),
        name: "Via route",
        tracks: [{ id: t.id, name: "Via route track", price: t.price, trackNumber: 1, files: t.files.map(asFileInput) }],
      }),
      ctx(release.id),
    );

    expect(res.status).toBe(200);
    const after = await prisma.release.findUnique({ where: { id: release.id }, include: { tracks: true } });
    expect(after?.name).toBe("Via route");
    expect(after?.tracks[0].id).toBe(t.id);
    expect(after?.tracks[0].name).toBe("Via route track");
  });

  it("DELETE removes the release and cascades to its tracks + files", async () => {
    const release = await makeRelease();
    await makeTrackWithFile(release.id);
    await makeTrackWithFile(release.id, { trackNumber: 2 });

    const res = await deleteRelease(
      new Request("http://test", { method: "DELETE" }) as unknown as NextRequest,
      ctx(release.id),
    );
    expect(res.status).toBe(200);
    expect(await prisma.release.findUnique({ where: { id: release.id } })).toBeNull();
    expect(await prisma.track.count({ where: { releaseId: release.id } })).toBe(0);
  });

  it("DELETE cleans up R2 cover image, track files, and previews", async () => {
    const release = await prisma.release.create({
      data: {
        name: "Has cover",
        slug: `cover-${Math.random().toString(36).slice(2, 8)}`,
        price: 999,
        type: "single",
        isPublished: true,
        coverImageUrl: "https://r2/cover.jpg",
      },
    });
    const t = await makeTrackWithFile(release.id, { storageKey: "https://r2/track.mp3" });
    await prisma.track.update({ where: { id: t.id }, data: { previewUrl: "https://r2/preview.mp3" } });

    await deleteRelease(
      new Request("http://test", { method: "DELETE" }) as unknown as NextRequest,
      ctx(release.id),
    );

    const calls = vi.mocked(deleteFile).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(["https://r2/cover.jpg", "https://r2/preview.mp3", "https://r2/track.mp3"]);
  });

  it("DELETE returns 404 for a release that doesn't exist", async () => {
    const res = await deleteRelease(
      new Request("http://test", { method: "DELETE" }) as unknown as NextRequest,
      ctx(99999),
    );
    expect(res.status).toBe(404);
    expect(vi.mocked(deleteFile)).not.toHaveBeenCalled();
  });
});
