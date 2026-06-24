import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  cleanupR2Objects,
  DuplicateTrackSlugError,
  StaleFormError,
  syncReleaseAndTracks,
  type TrackInput,
} from "@/lib/release-tracks";
import {
  applyDraftDefaults,
  validatePublishedRelease,
  validateReleasePayload,
} from "@/lib/release-validation";
import { RADIO_TRACKS_TAG, RELEASES_TAG } from "@/lib/cache-tags";
import { retagReleaseFiles } from "@/lib/release-retag";

// Re-tagging streams each track file through the function, so allow the same
// generous budget the upload/process route uses.
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);
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

  const incoming: TrackInput[] = (data.tracks ?? []).map((t) => ({
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
    await syncReleaseAndTracks(
      releaseId,
      {
        name: data.name,
        slug: data.slug!,
        description: data.description ?? null,
        price: data.price!,
        type: data.type!,
        coverImageUrl: data.coverImageUrl ?? null,
        releasedAt: data.releasedAt ?? null,
        isPublished: data.isPublished,
        inRadio: data.inRadio,
      },
      incoming,
    );
  } catch (err) {
    if (err instanceof StaleFormError || err instanceof DuplicateTrackSlugError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
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

  // Stamp the authoritative metadata + cover art onto the stored files.
  await retagReleaseFiles(release);

  revalidateTag(RADIO_TRACKS_TAG, "max");
  revalidateTag(RELEASES_TAG, "max");
  return NextResponse.json(release);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);
  const body = await req.json();

  const data: { inRadio?: boolean; isPublished?: boolean } = {};
  if (typeof body.inRadio === "boolean") data.inRadio = body.inRadio;
  if (typeof body.isPublished === "boolean") data.isPublished = body.isPublished;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }

  // Side-door guard: PATCH can flip isPublished without going through the form,
  // so re-validate against the persisted state before letting an invalid draft
  // go live.
  if (data.isPublished === true) {
    const current = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
      with: {
        tracks: {
          orderBy: (t, { asc }) => asc(t.trackNumber),
          with: { files: true },
        },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    if (!current.isPublished) {
      const validation = validatePublishedRelease({
        ...current,
        isPublished: true,
        releasedAt: current.releasedAt ?? null,
      });
      if (!validation.ok) {
        return NextResponse.json(
          { error: "Cannot publish — required fields are missing", ...validation.errors },
          { status: 400 },
        );
      }
    }
  }

  const [release] = await db
    .update(releases)
    .set(data)
    .where(eq(releases.id, releaseId))
    .returning();

  if (data.inRadio !== undefined || data.isPublished !== undefined) {
    revalidateTag(RADIO_TRACKS_TAG, "max");
    revalidateTag(RELEASES_TAG, "max");
  }

  return NextResponse.json(release);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);

  // Capture every R2 object referenced by this release before the cascade nukes the rows.
  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
    with: { tracks: { with: { files: true } } },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const r2KeysToDelete: string[] = [
    ...(release.coverImageUrl ? [release.coverImageUrl] : []),
    ...release.tracks.flatMap((t) => t.files.map((f) => f.storageKey)),
  ];

  await db.delete(releases).where(eq(releases.id, releaseId));

  if (r2KeysToDelete.length > 0) {
    await cleanupR2Objects(r2KeysToDelete);
  }

  revalidateTag(RADIO_TRACKS_TAG, "max");
  revalidateTag(RELEASES_TAG, "max");

  return NextResponse.json({ ok: true });
}
