/**
 * Shared zip-manifest logic for release downloads. The customer download route
 * (`/download/[token]/zip`) and the admin release-edit page both build their
 * archives through here, so an admin testing a download gets a byte-identical
 * result to what a customer receives.
 */
import { prisma } from "@/lib/db";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { cleanDownloadFilename } from "@/lib/utils";

/** A file destined for the zip, paired with the storage object it streams from. */
export interface ZipFile {
  fileName: string;
  storageKey: string;
  contentType: string;
}

/** A presigned manifest the client (Service Worker + `client-zip`) streams from. */
export interface ZipManifest {
  zipName: string;
  files: { fileName: string; url: string }[];
}

/** Strip path separators so a release/track name can't spawn unintended zip subfolders. */
export function sanitizeSegment(name: string): string {
  return name.replace(/[/\\]+/g, "-").trim();
}

/**
 * Detects extended-mix tracks from their filename. The catalog marks them
 * inconsistently ("Extended", "(Extended)", "[EXTENDED MIX]"), so a loose
 * whole-word match on "extended" catches every variant.
 */
export function isExtendedMix(fileName: string): boolean {
  return /\bextended\b/i.test(fileName);
}

/**
 * Builds a zip entry path: `[Release Name/][Extended/]filename`. Extended mixes
 * are nested in their own `Extended/` subfolder so they don't clutter the main
 * release listing. `releaseName` is null for single-release zips (which stay
 * flat apart from the `Extended/` split).
 */
export function zipEntryPath(releaseName: string | null, fileName: string): string {
  const clean = cleanDownloadFilename(fileName);
  const segments: string[] = [];
  if (releaseName) segments.push(sanitizeSegment(releaseName));
  if (isExtendedMix(clean)) segments.push("Extended");
  segments.push(clean);
  return segments.join("/");
}

/** Zip filename for a release's cover art, e.g. `Yacht House Summer - Vol 2 - COVER ART.jpg`. */
export function coverArtFilename(releaseName: string): string {
  return `${sanitizeSegment(releaseName)} - COVER ART.jpg`;
}

/**
 * Cover-art zip entries for a full-release download: the artwork alongside the
 * tracks, plus a copy inside the `Extended/` subfolder when the track entries
 * use one. `folder` is the release's `Name/` prefix for multi-release zips, or
 * an empty string for flat single-release zips.
 */
export function coverArtEntries(
  releaseName: string,
  coverImageUrl: string,
  folder: string,
  trackEntries: ZipFile[],
): ZipFile[] {
  const file = coverArtFilename(releaseName);
  const entries: ZipFile[] = [
    { fileName: `${folder}${file}`, storageKey: coverImageUrl, contentType: "image/jpeg" },
  ];
  if (trackEntries.some((e) => e.fileName.split("/").includes("Extended"))) {
    entries.push({
      fileName: `${folder}Extended/${file}`,
      storageKey: coverImageUrl,
      contentType: "image/jpeg",
    });
  }
  return entries;
}

/** Presign every zip entry into the `{ fileName, url }` manifest shape. */
export function presignZipFiles(files: ZipFile[]): Promise<ZipManifest["files"]> {
  return Promise.all(
    files.map(async (t) => ({
      fileName: t.fileName,
      url: await getPresignedDownloadUrl(t.storageKey, {
        filename: t.fileName.split("/").pop() ?? t.fileName,
        contentType: t.contentType,
      }),
    })),
  );
}

/**
 * Discriminated result for the customer-zip resolver — `ok: false` carries
 * the HTTP status and message the caller should return.
 */
export type ResolveCustomerZipResult =
  | { ok: true; zipName: string; files: ZipFile[] }
  | { ok: false; status: number; error: string };

export interface ResolveCustomerZipParams {
  token: string;
  /** Single-release download; falsy means "whole order or selected tracks". */
  releaseId?: number;
  /** Comma-separated track IDs for partial-order downloads. */
  trackIdsParam?: string | null;
  /** "mp3" or "wav". */
  format: string;
}

/**
 * Auth + file-list resolution for a customer's bulk download. Returns the
 * canonical `{ zipName, files }` for the token so the manifest route (SW
 * path) and the server-side streaming route produce byte-identical archives.
 *
 * Branches mirror the manifest endpoint:
 *  - `trackIdsParam` set → curated track list, flat layout, "Tracks" zip name
 *  - no `releaseId`     → whole order: releases + à-la-carte tracks
 *  - `releaseId` set    → single full release via `buildReleaseZipBundle`
 */
export async function resolveCustomerZip(
  params: ResolveCustomerZipParams,
): Promise<ResolveCustomerZipResult> {
  const { token, releaseId, trackIdsParam, format } = params;
  const audioContentType = format === "wav" ? "audio/wav" : "audio/mpeg";

  const downloadToken = await prisma.downloadToken.findUnique({
    where: { token },
    select: {
      order: {
        select: {
          id: true,
          items: { select: { trackId: true, releaseId: true } },
        },
      },
    },
  });

  if (!downloadToken) {
    return { ok: false, status: 404, error: "Invalid download link" };
  }

  let trackFiles: ZipFile[];
  let zipName: string;

  if (trackIdsParam) {
    const requestedTrackIds = trackIdsParam.split(",").map(Number);
    const orderTrackIds = new Set(
      downloadToken.order.items.filter((item) => item.trackId).map((item) => item.trackId!),
    );
    const allOwned = requestedTrackIds.every((id) => orderTrackIds.has(id));
    if (!allOwned) {
      return { ok: false, status: 403, error: "Track not in order" };
    }

    const tracks = await prisma.track.findMany({
      where: { id: { in: requestedTrackIds } },
      include: { files: { where: { format } }, release: { select: { name: true } } },
    });
    const trackById = new Map(tracks.map((t) => [t.id, t]));

    // Preserve request order — that's the order the customer chose at checkout.
    trackFiles = requestedTrackIds
      .map((id) => trackById.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined && t.files.length > 0)
      .map((t) => ({
        fileName: zipEntryPath(t.release.name, t.files[0].fileName),
        storageKey: t.files[0].storageKey,
        contentType: audioContentType,
      }));

    zipName = `Party Pupils - Tracks (${format.toUpperCase()}).zip`;
  } else if (!releaseId) {
    const orderReleaseIds = downloadToken.order.items
      .map((item) => item.releaseId)
      .filter((id): id is number => id !== null);
    const orderTrackIds = downloadToken.order.items
      .map((item) => item.trackId)
      .filter((id): id is number => id !== null);

    const [releases, aLaCarteTracks] = await Promise.all([
      prisma.release.findMany({
        where: { id: { in: orderReleaseIds } },
        include: {
          tracks: {
            orderBy: { trackNumber: "asc" },
            include: { files: { where: { format } } },
          },
        },
      }),
      prisma.track.findMany({
        where: { id: { in: orderTrackIds } },
        include: { files: { where: { format } }, release: { select: { name: true } } },
      }),
    ]);

    // Each full release contributes its tracks, plus its cover art when present.
    const releaseFiles = releases.flatMap((release) => {
      const entries: ZipFile[] = release.tracks
        .filter((t) => t.files.length > 0)
        .map((track) => ({
          fileName: zipEntryPath(release.name, track.files[0].fileName),
          storageKey: track.files[0].storageKey,
          contentType: audioContentType,
        }));
      if (entries.length > 0 && release.coverImageUrl) {
        entries.push(
          ...coverArtEntries(
            release.name,
            release.coverImageUrl,
            `${sanitizeSegment(release.name)}/`,
            entries,
          ),
        );
      }
      return entries;
    });
    const aLaCarteFiles: ZipFile[] = aLaCarteTracks
      .filter((t) => t.files.length > 0)
      .map((t) => ({
        fileName: zipEntryPath(t.release.name, t.files[0].fileName),
        storageKey: t.files[0].storageKey,
        contentType: audioContentType,
      }));

    trackFiles = [...releaseFiles, ...aLaCarteFiles];
    zipName = `Party Pupils - Order ${downloadToken.order.id} (${format.toUpperCase()}).zip`;
  } else {
    const orderHasRelease = downloadToken.order.items.some(
      (item) => item.releaseId === releaseId,
    );

    if (!orderHasRelease) {
      return { ok: false, status: 403, error: "Release not in order" };
    }

    const bundle = await buildReleaseZipBundle(releaseId, format);
    if (!bundle) {
      return { ok: false, status: 404, error: "Release not found" };
    }
    trackFiles = bundle.files;
    zipName = bundle.zipName;
  }

  if (trackFiles.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "No audio files have been uploaded for these tracks yet.",
    };
  }

  return { ok: true, zipName, files: trackFiles };
}

/**
 * Builds the flat single-release zip layout: every track in `format`, extended
 * mixes nested under `Extended/`, and the release cover art (when set) placed
 * both alongside the tracks and inside `Extended/`. Returns null when the
 * release doesn't exist; an empty `files` array means it has no audio uploaded.
 */
export async function buildReleaseZipBundle(
  releaseId: number,
  format: string,
): Promise<{ zipName: string; files: ZipFile[] } | null> {
  const audioContentType = format === "wav" ? "audio/wav" : "audio/mpeg";
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: {
      tracks: {
        orderBy: { trackNumber: "asc" },
        include: { files: { where: { format } } },
      },
    },
  });
  if (!release) return null;

  const files: ZipFile[] = release.tracks
    .filter((t) => t.files.length > 0)
    .map((track) => ({
      fileName: zipEntryPath(null, track.files[0].fileName),
      storageKey: track.files[0].storageKey,
      contentType: audioContentType,
    }));
  if (files.length > 0 && release.coverImageUrl) {
    files.push(...coverArtEntries(release.name, release.coverImageUrl, "", files));
  }

  return { zipName: `${release.name} (${format.toUpperCase()}).zip`, files };
}
