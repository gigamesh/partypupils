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
import { and, asc, count, eq } from "drizzle-orm";
import { POST as createRelease } from "@/app/api/admin/releases/route";
import {
  PUT as updateRelease,
  PATCH as patchRelease,
  DELETE as deleteRelease,
} from "@/app/api/admin/releases/[id]/route";
import { syncReleaseAndTracks } from "@/lib/release-tracks";
import { deleteFile } from "@/lib/storage";
import { db } from "@/lib/db";
import {
  orderItems,
  releases,
  trackFiles,
  tracks,
} from "@/db/schema";
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

/** Map a TrackFile row back into the FileInput shape the sync function expects. */
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
    coverImageUrl: "https://r2/cover.jpg",
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

    const after = await db.query.releases.findFirst({
      where: eq(releases.id, release.id),
      with: { tracks: { orderBy: (t, { asc: ascFn }) => ascFn(t.trackNumber) } },
    });
    expect(after?.name).toBe("Renamed");
    expect(after?.tracks.map((t) => t.id)).toEqual([t1.id, t2.id]);
    expect(after?.tracks[0]?.name).toBe("Renamed 1");
  });

  it("does NOT silently null OrderItem.trackId for tracks that survived the edit (the regression)", async () => {
    const release = await makeRelease();
    const t1 = await makeTrackWithFile(release.id, { name: "Bought" });
    await makeCompletedOrder({ email: "buyer@test", trackIds: [t1.id] });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t1.id, name: "Bought (renamed)", price: t1.price, trackNumber: 1, files: t1.files.map(asFileInput) },
    ]);

    const orderItem = await db.query.orderItems.findFirst({
      where: eq(orderItems.trackId, t1.id),
    });
    expect(orderItem?.trackId).toBe(t1.id);
  });

  it("deletes tracks absent from the payload", async () => {
    const release = await makeRelease();
    const keep = await makeTrackWithFile(release.id, { name: "Keep", trackNumber: 1 });
    const drop = await makeTrackWithFile(release.id, { name: "Drop", trackNumber: 2 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: keep.id, name: keep.name, price: keep.price, trackNumber: 1, files: keep.files.map(asFileInput) },
    ]);

    const remaining = await db.query.tracks.findMany({
      where: eq(tracks.releaseId, release.id),
    });
    expect(remaining.map((t) => t.id)).toEqual([keep.id]);
    expect(
      await db.query.tracks.findFirst({ where: eq(tracks.id, drop.id) }),
    ).toBeUndefined();
  });

  it("creates new tracks (entries without an id)", async () => {
    const release = await makeRelease();
    const existing = await makeTrackWithFile(release.id, { name: "Existing", trackNumber: 1 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: existing.id, name: existing.name, price: existing.price, trackNumber: 1, files: existing.files.map(asFileInput) },
      { name: "Brand new", price: 200, trackNumber: 2, files: [{ format: "mp3", fileName: "new.mp3", storageKey: "https://r2/new.mp3", fileSize: 5 }] },
    ]);

    const trackRows = await db.query.tracks.findMany({
      where: eq(tracks.releaseId, release.id),
      orderBy: asc(tracks.trackNumber),
    });
    expect(trackRows.map((t) => t.name)).toEqual(["Existing", "Brand new"]);
    expect(trackRows[0]?.id).toBe(existing.id);
    expect(trackRows[1]?.id).not.toBe(existing.id);
  });

  it("does NOT churn TrackFile rows when (format, storageKey) is unchanged", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const fileIdBefore = t.files[0]!.id;

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: "renamed scalar", price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
    ]);

    const after = await db.query.trackFiles.findFirst({
      where: eq(trackFiles.trackId, t.id),
    });
    expect(after?.id).toBe(fileIdBefore);
  });

  it("replaces TrackFile rows when storageKey changes (new audio uploaded)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const fileIdBefore = t.files[0]!.id;

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      {
        id: t.id,
        name: t.name,
        price: t.price,
        trackNumber: 1,
        files: [{ format: "mp3", fileName: "newer.mp3", storageKey: "https://r2/newer.mp3", fileSize: 99 }],
      },
    ]);

    const after = await db.query.trackFiles.findMany({
      where: eq(trackFiles.trackId, t.id),
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).not.toBe(fileIdBefore);
    expect(after[0]?.storageKey).toBe("https://r2/newer.mp3");
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

    // Track survives (delete-all-because-tracks-empty must NOT have committed).
    expect(
      await db.query.tracks.findFirst({ where: eq(tracks.id, t.id) }),
    ).not.toBeUndefined();
    // Release name unchanged.
    expect(
      (await db.query.releases.findFirst({ where: eq(releases.id, release.id) }))?.name,
    ).toBe(release.name);
  });

  it("reorders tracks (same IDs, different trackNumber values)", async () => {
    const release = await makeRelease();
    const a = await makeTrackWithFile(release.id, { name: "A", trackNumber: 1 });
    const b = await makeTrackWithFile(release.id, { name: "B", trackNumber: 2 });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: b.id, name: b.name, price: b.price, trackNumber: 1, files: b.files.map(asFileInput) },
      { id: a.id, name: a.name, price: a.price, trackNumber: 2, files: a.files.map(asFileInput) },
    ]);

    const sorted = await db.query.tracks.findMany({
      where: eq(tracks.releaseId, release.id),
      orderBy: asc(tracks.trackNumber),
    });
    expect(sorted.map((t) => t.name)).toEqual(["B", "A"]);
    expect(sorted.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("cleans up R2 objects when tracks are deleted (best-effort, after the DB commit)", async () => {
    const release = await makeRelease();
    const keep = await makeTrackWithFile(release.id, { name: "Keep", trackNumber: 1 });
    await makeTrackWithFile(release.id, {
      name: "Drop",
      trackNumber: 2,
      storageKey: "https://r2/dropped.mp3",
    });

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: keep.id, name: keep.name, price: keep.price, trackNumber: 1, files: keep.files.map(asFileInput) },
    ]);

    const calls = vi.mocked(deleteFile).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(["https://r2/dropped.mp3"]);
  });

  it("does not call deleteFile when no tracks were deleted", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: "renamed", price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
    ]);

    expect(vi.mocked(deleteFile)).not.toHaveBeenCalled();
  });

  it("refuses (StaleFormError) when payload has tracks but none carry an id while DB has tracks", async () => {
    const release = await makeRelease();
    await makeTrackWithFile(release.id, { name: "Real" });

    const failed = await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { name: "Stale", price: 100, trackNumber: 1, files: [] }, // no id
    ]).catch((e) => e);

    expect(failed).toBeInstanceOf(Error);
    expect(failed.name).toBe("StaleFormError");
    // Original tracks still present.
    const [trackCount] = await db
      .select({ count: count() })
      .from(tracks)
      .where(eq(tracks.releaseId, release.id));
    expect(trackCount?.count ?? 0).toBe(1);
  });

  it("does NOT trigger StaleFormError when the release has no existing tracks (legit creation flow)", async () => {
    const release = await makeRelease();
    // No tracks in DB; payload has new tracks without ids — this is the normal "first save" case.

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      {
        name: "Brand new",
        price: 100,
        trackNumber: 1,
        files: [{ format: "mp3", fileName: "x.mp3", storageKey: "https://r2/x.mp3", fileSize: 5 }],
      },
    ]);

    const trackRows = await db.query.tracks.findMany({
      where: eq(tracks.releaseId, release.id),
    });
    expect(trackRows).toHaveLength(1);
    expect(trackRows[0]?.name).toBe("Brand new");
  });

  it("ignores stray ids that don't belong to this release (treats them as deletions)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Real" });
    // Payload references id 99999 which doesn't exist — should be filtered out, not crash.

    await syncReleaseAndTracks(release.id, scalarsFor(release), [
      { id: t.id, name: t.name, price: t.price, trackNumber: 1, files: t.files.map(asFileInput) },
      { id: 99999, name: "Phantom", price: 0, trackNumber: 2, files: [] }, // stray
    ]);

    const trackRows = await db.query.tracks.findMany({
      where: eq(tracks.releaseId, release.id),
    });
    // Only the real track survives; the stray id was silently dropped (it's not in existingById).
    expect(trackRows.map((t) => t.id)).toEqual([t.id]);
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
        coverImageUrl: "https://r2/cover.jpg",
        isPublished: true,
        tracks: [
          {
            name: "T1",
            artist: "Artist",
            price: 150,
            trackNumber: 1,
            files: [
              { format: "wav", fileName: "a.wav", storageKey: "https://r2/a.wav", fileSize: 10 },
              { format: "mp3", fileName: "a.mp3", storageKey: "https://r2/a.mp3", fileSize: 10 },
            ],
          },
          {
            name: "T2",
            artist: "Artist",
            price: 150,
            trackNumber: 2,
            files: [
              { format: "wav", fileName: "b.wav", storageKey: "https://r2/b.wav", fileSize: 10 },
              { format: "mp3", fileName: "b.mp3", storageKey: "https://r2/b.mp3", fileSize: 10 },
            ],
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const created = await db.query.releases.findFirst({
      where: eq(releases.slug, "album-one"),
      with: {
        tracks: {
          with: { files: true },
          orderBy: (t, { asc: ascFn }) => ascFn(t.trackNumber),
        },
      },
    });
    expect(created?.tracks).toHaveLength(2);
    expect(created?.tracks[0]?.files).toHaveLength(2);
  });

  it("rejects duplicate slug with 400", async () => {
    await makeRelease({ slug: "dup" });
    const res = await createRelease(
      jsonRequest("POST", { name: "Dup", slug: "dup", price: 100, type: "single", coverImageUrl: "https://r2/cover.jpg", isPublished: false, tracks: [] }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PUT/DELETE /api/admin/releases/[id] (route wiring)", () => {
  it("PUT routes through to syncReleaseAndTracks (smoke test for handler glue)", async () => {
    // Draft release — smoke test is about route wiring, not strict publish validation.
    const release = await makeRelease({ isPublished: false });
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
    const after = await db.query.releases.findFirst({
      where: eq(releases.id, release.id),
      with: { tracks: true },
    });
    expect(after?.name).toBe("Via route");
    expect(after?.tracks[0]?.id).toBe(t.id);
    expect(after?.tracks[0]?.name).toBe("Via route track");
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
    expect(
      await db.query.releases.findFirst({ where: eq(releases.id, release.id) }),
    ).toBeUndefined();
    const [trackCount] = await db
      .select({ count: count() })
      .from(tracks)
      .where(eq(tracks.releaseId, release.id));
    expect(trackCount?.count ?? 0).toBe(0);
  });

  it("DELETE cleans up R2 cover image and track files", async () => {
    const [release] = await db
      .insert(releases)
      .values({
        name: "Has cover",
        slug: `cover-${Math.random().toString(36).slice(2, 8)}`,
        price: 999,
        type: "single",
        isPublished: true,
        coverImageUrl: "https://r2/cover.jpg",
      })
      .returning();
    await makeTrackWithFile(release!.id, { storageKey: "https://r2/track.mp3" });

    await deleteRelease(
      new Request("http://test", { method: "DELETE" }) as unknown as NextRequest,
      ctx(release!.id),
    );

    const calls = vi.mocked(deleteFile).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(["https://r2/cover.jpg", "https://r2/track.mp3"]);
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

describe("Draft / publish validation flows", () => {
  /** Build a minimal valid published payload for the API. Override per test. */
  function validPublishedPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: "Album",
      slug: `pub-${Math.random().toString(36).slice(2, 8)}`,
      price: 1000,
      type: "album",
      coverImageUrl: "https://r2/cover.jpg",
      isPublished: true,
      tracks: [
        {
          name: "T1",
          artist: "Artist",
          price: 200,
          trackNumber: 1,
          files: [
            { format: "wav", fileName: "t.wav", storageKey: "https://r2/t.wav", fileSize: 10 },
            { format: "mp3", fileName: "t.mp3", storageKey: "https://r2/t.mp3", fileSize: 10 },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("POST creates a draft with a name + cover (sentinels fill the rest)", async () => {
    const res = await createRelease(
      jsonRequest("POST", {
        name: "Untitled Draft",
        coverImageUrl: "https://r2/cover.jpg",
        isPublished: false,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.isPublished).toBe(false);
    expect(body.slug).toMatch(/^draft-[a-f0-9]+$/);
    expect(body.price).toBe(0);
    expect(body.type).toBe("single");

    const [trackCount] = await db
      .select({ count: count() })
      .from(tracks)
      .where(eq(tracks.releaseId, body.id));
    expect(trackCount?.count ?? 0).toBe(0);
  });

  it("POST with isPublished:true rejects missing price with structured fieldErrors", async () => {
    const { price: _omit, ...withoutPrice } = validPublishedPayload();
    void _omit;
    const res = await createRelease(jsonRequest("POST", withoutPrice));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.price).toBeDefined();
  });

  it("POST with isPublished:true rejects a track that lacks a WAV", async () => {
    const payload = validPublishedPayload({
      tracks: [
        {
          name: "T",
          artist: "A",
          price: 200,
          trackNumber: 1,
          files: [
            { format: "mp3", fileName: "t.mp3", storageKey: "https://r2/t.mp3", fileSize: 10 },
          ],
        },
      ],
    });
    const res = await createRelease(jsonRequest("POST", payload));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors["tracks[0].files"]).toBeDefined();
  });

  it("POST with isPublished:true rejects a track that lacks an artist", async () => {
    const payload = validPublishedPayload({
      tracks: [
        {
          name: "T",
          price: 200,
          trackNumber: 1,
          files: [
            { format: "wav", fileName: "t.wav", storageKey: "https://r2/t.wav", fileSize: 10 },
          ],
        },
      ],
    });
    const res = await createRelease(jsonRequest("POST", payload));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors["tracks[0].artist"]).toBeDefined();
  });

  it("PUT promotes a draft to published when the payload is valid", async () => {
    const [draft] = await db
      .insert(releases)
      .values({
        name: "Promo",
        slug: `draft-${Math.random().toString(36).slice(2, 8)}`,
        price: 0,
        type: "single",
        isPublished: false,
      })
      .returning();

    const res = await updateRelease(
      jsonRequest("PUT", validPublishedPayload({ name: "Promo", slug: "promo-final" })),
      ctx(draft!.id),
    );
    expect(res.status).toBe(200);
    const after = await db.query.releases.findFirst({
      where: eq(releases.id, draft!.id),
    });
    expect(after?.isPublished).toBe(true);
    expect(after?.slug).toBe("promo-final");
  });

  it("PUT rejects a publish payload whose slug is still auto-generated", async () => {
    const [draft] = await db
      .insert(releases)
      .values({
        name: "x",
        slug: `draft-${Math.random().toString(36).slice(2, 8)}`,
        price: 0,
        type: "single",
        isPublished: false,
      })
      .returning();
    const res = await updateRelease(
      jsonRequest("PUT", validPublishedPayload({ slug: "draft-leftover" })),
      ctx(draft!.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.slug).toBeDefined();
  });

  it("PATCH refuses to flip an invalid draft to published", async () => {
    const [draft] = await db
      .insert(releases)
      .values({
        name: "x",
        slug: `draft-${Math.random().toString(36).slice(2, 8)}`,
        price: 0,
        type: "single",
        isPublished: false,
      })
      .returning();

    const res = await patchRelease(
      jsonRequest("PATCH", { isPublished: true }),
      ctx(draft!.id),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    const stillDraft = await db.query.releases.findFirst({
      where: eq(releases.id, draft!.id),
    });
    expect(stillDraft?.isPublished).toBe(false);
  });

  it("PATCH flips a fully-valid draft to published", async () => {
    // Build the publish-ready draft top-down: release → track → file. The
    // Prisma version used nested `create`; in Drizzle we do three inserts in a
    // transaction so the file references the newly-minted track id.
    const draftId = await db.transaction(async (tx) => {
      const [draft] = await tx
        .insert(releases)
        .values({
          name: "Ready",
          slug: "ready-to-go",
          price: 1500,
          type: "album",
          coverImageUrl: "https://r2/cover.jpg",
          isPublished: false,
        })
        .returning({ id: releases.id });
      const [track] = await tx
        .insert(tracks)
        .values({
          releaseId: draft!.id,
          name: "Solo",
          artist: "Solo Artist",
          slug: "solo",
          price: 300,
          trackNumber: 1,
        })
        .returning({ id: tracks.id });
      await tx.insert(trackFiles).values({
        trackId: track!.id,
        format: "wav",
        fileName: "s.wav",
        storageKey: "https://r2/s.wav",
        fileSize: 99,
      });
      return draft!.id;
    });

    const res = await patchRelease(
      jsonRequest("PATCH", { isPublished: true }),
      ctx(draftId),
    );
    expect(res.status).toBe(200);
    const after = await db.query.releases.findFirst({
      where: eq(releases.id, draftId),
    });
    expect(after?.isPublished).toBe(true);
  });

  it("PATCH ignores re-publish of an already-published release without re-validation", async () => {
    // Already-true → still-true bypasses validation. This guards against forcing
    // admins to fix unrelated data when they only toggle inRadio etc.
    const [release] = await db
      .insert(releases)
      .values({
        name: "Live",
        slug: `live-${Math.random().toString(36).slice(2, 8)}`,
        price: 1000,
        type: "single",
        isPublished: true,
      })
      .returning();
    const res = await patchRelease(
      jsonRequest("PATCH", { isPublished: true }),
      ctx(release!.id),
    );
    expect(res.status).toBe(200);
  });
});

// Silence unused-import lint — `and` is exported for future query expansions.
void and;
