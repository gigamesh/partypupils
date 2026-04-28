/**
 * Release/track persistence helpers.
 *
 * Extracted from the PUT /api/admin/releases/[id] handler so the diff +
 * apply logic can be unit-tested directly, without constructing HTTP
 * requests or mocking Next route plumbing.
 */
import { Prisma, type ReleaseType } from "@/generated/prisma/client";
import { prisma } from "./db";

export interface FileInput {
  format: string;
  fileName: string;
  storageKey: string;
  fileSize: number;
}

export interface TrackInput {
  /** Present for tracks that already exist in the DB; absent for new tracks. */
  id?: number;
  name: string;
  price: number;
  trackNumber: number;
  previewUrl?: string | null;
  files: FileInput[];
}

export interface ReleaseScalarsInput {
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  type: ReleaseType;
  coverImageUrl?: string | null;
  releasedAt?: string | Date | null;
  isPublished: boolean;
}

/** Stable signature of a TrackFile by (format, storageKey) so we can decide whether files actually changed. */
function fileKey(f: { format: string; storageKey: string }): string {
  return `${f.format}::${f.storageKey}`;
}

/**
 * Atomically apply a release update with incremental track sync:
 *
 *   - tracks present in DB but absent from `incoming` → DELETE (cascades to TrackFile)
 *   - tracks in `incoming` with an id that exists       → UPDATE scalar fields;
 *                                                         replace TrackFile rows
 *                                                         only when (format, storageKey)
 *                                                         set actually changed
 *   - tracks in `incoming` without an id                → CREATE with nested files
 *
 * All operations run in a single $transaction, so a failure rolls back cleanly.
 *
 * Track IDs survive across edits — protecting OrderItem.trackId references that
 * would otherwise be silently nulled by Postgres `ON DELETE SET NULL`.
 */
export async function syncReleaseAndTracks(
  releaseId: number,
  scalars: ReleaseScalarsInput,
  incoming: TrackInput[],
): Promise<void> {
  const existing = await prisma.track.findMany({
    where: { releaseId },
    include: { files: true },
  });
  const existingById = new Map(existing.map((t) => [t.id, t]));

  const incomingExistingIds = new Set(
    incoming.map((t) => t.id).filter((x): x is number => x != null),
  );
  const toDeleteIds = existing
    .filter((t) => !incomingExistingIds.has(t.id))
    .map((t) => t.id);
  const toUpdate = incoming.filter(
    (t): t is TrackInput & { id: number } => t.id != null && existingById.has(t.id),
  );
  const toCreate = incoming.filter((t) => t.id == null);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.release.update({
      where: { id: releaseId },
      data: {
        name: scalars.name,
        slug: scalars.slug,
        description: scalars.description ?? null,
        price: scalars.price,
        type: scalars.type,
        coverImageUrl: scalars.coverImageUrl ?? null,
        releasedAt: scalars.releasedAt ? new Date(scalars.releasedAt) : null,
        isPublished: scalars.isPublished,
      },
    }),
  ];

  if (toDeleteIds.length > 0) {
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
}
