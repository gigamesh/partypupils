/**
 * Admin-only zip-manifest helpers. The customer download routes now build
 * archives through `@gigamusic/checkout`'s `createDownloadZip*Handler` family,
 * so this module is the residual support for the admin release-edit page's
 * "download as a customer would" preview at `/api/admin/download/zip`.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
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
function sanitizeSegment(name: string): string {
  return name.replace(/[/\\]+/g, "-").trim();
}

/**
 * Detects extended-mix tracks from their filename. The catalog marks them
 * inconsistently ("Extended", "(Extended)", "[EXTENDED MIX]"), so a loose
 * whole-word match on "extended" catches every variant.
 */
function isExtendedMix(fileName: string): boolean {
  return /\bextended\b/i.test(fileName);
}

/**
 * Builds a zip entry path: `[Extended/]filename`. Extended mixes are nested in
 * their own `Extended/` subfolder so they don't clutter the main release
 * listing. Single-release admin zips stay flat apart from the `Extended/` split.
 */
function zipEntryPath(fileName: string): string {
  const clean = cleanDownloadFilename(fileName);
  const segments: string[] = [];
  if (isExtendedMix(clean)) segments.push("Extended");
  segments.push(clean);
  return segments.join("/");
}

/** Zip filename for a release's cover art, e.g. `Yacht House Summer - Vol 2 - COVER ART.jpg`. */
function coverArtFilename(releaseName: string): string {
  return `${sanitizeSegment(releaseName)} - COVER ART.jpg`;
}

/**
 * Cover-art zip entries for a full-release admin download: the artwork
 * alongside the tracks, plus a copy inside the `Extended/` subfolder when the
 * track entries use one.
 */
function coverArtEntries(
  releaseName: string,
  coverImageUrl: string,
  trackEntries: ZipFile[],
): ZipFile[] {
  const file = coverArtFilename(releaseName);
  const entries: ZipFile[] = [
    { fileName: file, storageKey: coverImageUrl, contentType: "image/jpeg" },
  ];
  if (trackEntries.some((e) => e.fileName.split("/").includes("Extended"))) {
    entries.push({
      fileName: `Extended/${file}`,
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
  const release = await db.query.releases.findFirst({
    where: eq(releases.id, releaseId),
    with: {
      tracks: {
        orderBy: (t, { asc: ascFn }) => ascFn(t.trackNumber),
        with: { files: { where: (f, { eq: eqFn }) => eqFn(f.format, format) } },
      },
    },
  });
  if (!release) return null;

  const files: ZipFile[] = release.tracks
    .filter((t) => t.files.length > 0)
    .map((track) => ({
      fileName: zipEntryPath(track.files[0]!.fileName),
      storageKey: track.files[0]!.storageKey,
      contentType: audioContentType,
    }));
  if (files.length > 0 && release.coverImageUrl) {
    files.push(...coverArtEntries(release.name, release.coverImageUrl, files));
  }

  return { zipName: `${release.name} (${format.toUpperCase()}).zip`, files };
}
