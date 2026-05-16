import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  DuplicateTrackSlugError,
  normalizeTrackSlugs,
  type TrackInput,
} from "@/lib/release-tracks";
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
  const { name, slug, description, price, type, coverImageUrl, releasedAt, isPublished, inRadio, tracks } = body;

  const incomingTracks: TrackInput[] = Array.isArray(tracks) ? tracks : [];
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
        name,
        slug,
        description,
        price,
        type,
        coverImageUrl,
        releasedAt: releasedAt ? new Date(releasedAt) : null,
        isPublished,
        inRadio: inRadio ?? true,
        tracks: {
          create: incomingTracks.map((t) => ({
            name: t.name,
            slug: t.slug,
            price: t.price,
            trackNumber: t.trackNumber,
            previewUrl: t.previewUrl || null,
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
