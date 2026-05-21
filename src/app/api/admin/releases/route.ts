import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
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

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
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

  let release;
  try {
    release = await prisma.release.create({
      data: {
        name: data.name,
        slug: data.slug!,
        description: data.description ?? null,
        price: data.price!,
        type: data.type!,
        coverImageUrl: data.coverImageUrl ?? null,
        releasedAt: data.releasedAt ? new Date(data.releasedAt) : null,
        isPublished: data.isPublished,
        inRadio: data.inRadio ?? true,
        tracks: {
          create: incomingTracks.map((t) => ({
            name: t.name,
            artist: t.artist ?? null,
            genre: t.genre ?? null,
            slug: t.slug!,
            price: t.price,
            trackNumber: t.trackNumber,
            inRadio: t.inRadio ?? true,
            files: { create: t.files },
          })),
        },
      },
    });
  } catch (err) {
    // Rely on the DB-level unique constraint instead of a separate findUnique
    // pre-check (which had a tiny TOCTOU window between two concurrent admin
    // submits).
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    throw err;
  }

  revalidateTag(RADIO_TRACKS_TAG, "max");
  revalidateTag(RELEASES_TAG, "max");

  return NextResponse.json(release, { status: 201 });
}
