import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { verifyAdminSession } from "@/lib/admin-auth";

interface FileInput {
  format: string;
  fileName: string;
  storageKey: string;
  fileSize: number;
}

interface TrackInput {
  /** Present for tracks that already exist; absent for new tracks. */
  id?: number;
  name: string;
  price: number;
  trackNumber: number;
  previewUrl?: string | null;
  files: FileInput[];
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Stable signature of a TrackFile by storageKey + format, so we can decide whether files actually changed. */
function fileKey(f: { format: string; storageKey: string }): string {
  return `${f.format}::${f.storageKey}`;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const releaseId = parseInt(id);
  const body = await req.json();
  const { name, slug, description, price, type, coverImageUrl, releasedAt, isPublished } = body;
  const incoming: TrackInput[] = Array.isArray(body.tracks) ? body.tracks : [];

  const existing = await prisma.track.findMany({
    where: { releaseId },
    include: { files: true },
  });
  const existingById = new Map(existing.map((t) => [t.id, t]));

  const incomingExistingIds = new Set(incoming.map((t) => t.id).filter((x): x is number => x != null));
  const toDeleteIds = existing.filter((t) => !incomingExistingIds.has(t.id)).map((t) => t.id);
  const toUpdate = incoming.filter((t): t is TrackInput & { id: number } => t.id != null && existingById.has(t.id));
  const toCreate = incoming.filter((t) => t.id == null);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.release.update({
      where: { id: releaseId },
      data: {
        name,
        slug,
        description,
        price,
        type,
        coverImageUrl,
        releasedAt: releasedAt ? new Date(releasedAt) : null,
        isPublished,
      },
    }),
  ];

  if (toDeleteIds.length > 0) {
    // Cascade defined on TrackFile.track; OrderItem.trackId remains intact (SetNull) but
    // only for tracks that were genuinely removed from the release.
    ops.push(prisma.track.deleteMany({ where: { id: { in: toDeleteIds } } }));
  }

  for (const t of toUpdate) {
    ops.push(
      prisma.track.update({
        where: { id: t.id },
        data: {
          name: t.name,
          price: t.price,
          trackNumber: t.trackNumber,
          previewUrl: t.previewUrl || null,
        },
      }),
    );

    // Files: only churn if the set of (format, storageKey) actually changed.
    const existingTrack = existingById.get(t.id)!;
    const existingFileKeys = new Set(existingTrack.files.map(fileKey));
    const incomingFileKeys = new Set(t.files.map(fileKey));
    const filesUnchanged =
      existingFileKeys.size === incomingFileKeys.size &&
      [...incomingFileKeys].every((k) => existingFileKeys.has(k));

    if (!filesUnchanged) {
      ops.push(prisma.trackFile.deleteMany({ where: { trackId: t.id } }));
      if (t.files.length > 0) {
        ops.push(
          prisma.trackFile.createMany({
            data: t.files.map((f) => ({ ...f, trackId: t.id })),
          }),
        );
      }
    }
  }

  for (const t of toCreate) {
    ops.push(
      prisma.track.create({
        data: {
          releaseId,
          name: t.name,
          price: t.price,
          trackNumber: t.trackNumber,
          previewUrl: t.previewUrl || null,
          files: t.files.length > 0 ? { create: t.files } : undefined,
        },
      }),
    );
  }

  await prisma.$transaction(ops);

  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  return NextResponse.json(release);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await prisma.release.delete({ where: { id: parseInt(id) } });

  return NextResponse.json({ ok: true });
}
