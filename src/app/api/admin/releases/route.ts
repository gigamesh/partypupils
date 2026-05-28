import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases, trackFiles, tracks } from "@/db/schema";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  DuplicateTrackSlugError,
  normalizeTrackSlugs,
  type TrackInput,
} from "@/lib/release-tracks";
import {
  applyDraftDefaults,
  validateReleasePayload,
} from "@/lib/release-validation";
import { RADIO_TRACKS_TAG, RELEASES_TAG } from "@/lib/cache-tags";

/**
 * Postgres signals unique-constraint violation with SQLSTATE `23505`; the
 * pg driver exposes it on `err.code`. Replaces the Prisma `P2002` check used
 * before the Drizzle migration.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const validation = validateReleasePayload(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Validation failed", ...validation.errors },
      { status: 400 },
    );
  }

  const data = validation.data.isPublished
    ? validation.data
    : applyDraftDefaults(validation.data);

  const incomingTracks: TrackInput[] = (data.tracks ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? "",
    artist: t.artist ?? null,
    genre: t.genre ?? null,
    slug: t.slug,
    price: t.price ?? 0,
    trackNumber: t.trackNumber,
    inRadio: t.inRadio ?? true,
    files: (t.files ?? []).map((f) => ({
      format: f.format,
      fileName: f.fileName,
      storageKey: f.storageKey,
      fileSize: f.fileSize ?? 0,
    })),
  }));

  try {
    normalizeTrackSlugs(incomingTracks);
  } catch (err) {
    if (err instanceof DuplicateTrackSlugError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  let releaseId: number;
  try {
    releaseId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(releases)
        .values({
          name: data.name,
          slug: data.slug!,
          description: data.description ?? null,
          price: data.price!,
          type: data.type!,
          coverImageUrl: data.coverImageUrl ?? null,
          releasedAt: data.releasedAt ? new Date(data.releasedAt) : null,
          isPublished: data.isPublished,
          inRadio: data.inRadio ?? true,
        })
        .returning({ id: releases.id });

      const newReleaseId = created!.id;

      for (const t of incomingTracks) {
        const [track] = await tx
          .insert(tracks)
          .values({
            releaseId: newReleaseId,
            name: t.name,
            artist: t.artist ?? null,
            genre: t.genre ?? null,
            slug: t.slug!,
            price: t.price,
            trackNumber: t.trackNumber,
            inRadio: t.inRadio ?? true,
          })
          .returning({ id: tracks.id });
        if (t.files.length > 0) {
          await tx
            .insert(trackFiles)
            .values(t.files.map((f) => ({ ...f, trackId: track!.id })));
        }
      }

      return newReleaseId;
    });
  } catch (err) {
    // Rely on the DB-level unique constraint instead of a separate pre-check
    // (which had a tiny TOCTOU window between two concurrent admin submits).
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    throw err;
  }

  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
    with: {
      tracks: {
        orderBy: (t, { asc }) => asc(t.trackNumber),
        with: { files: true },
      },
    },
  });

  revalidateTag(RADIO_TRACKS_TAG, "max");
  revalidateTag(RELEASES_TAG, "max");

  return NextResponse.json(release, { status: 201 });
}
