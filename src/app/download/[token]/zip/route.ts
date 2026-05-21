import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { cleanDownloadFilename } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/** A file destined for the zip, paired with the storage object it streams from. */
interface ZipFile {
  fileName: string;
  storageKey: string;
  contentType: string;
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
 * Builds a zip entry path: `[Release Name/][Extended/]filename`. Extended mixes
 * are nested in their own `Extended/` subfolder so they don't clutter the main
 * release listing. `releaseName` is null for single-release zips (which stay
 * flat apart from the `Extended/` split).
 */
function zipEntryPath(releaseName: string | null, fileName: string): string {
  const clean = cleanDownloadFilename(fileName);
  const segments: string[] = [];
  if (releaseName) segments.push(sanitizeSegment(releaseName));
  if (isExtendedMix(clean)) segments.push("Extended");
  segments.push(clean);
  return segments.join("/");
}

/** Zip filename for a release's cover art, e.g. `Yacht House Summer - Vol 2 - COVER ART.jpg`. */
function coverArtFilename(releaseName: string): string {
  return `${sanitizeSegment(releaseName)} - COVER ART.jpg`;
}

/**
 * Cover-art zip entries for a full-release download: the artwork alongside the
 * tracks, plus a copy inside the `Extended/` subfolder when the track entries
 * use one. `folder` is the release's `Name/` prefix for multi-release zips, or
 * an empty string for flat single-release zips.
 */
function coverArtEntries(
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

/**
 * Returns a JSON manifest of presigned R2 GET URLs and target filenames so the
 * client (via a Service Worker + `client-zip`) can stream the archive directly
 * from R2 without ever routing audio bytes through the Vercel function.
 *
 * Multi-release archives nest each track under a `Release Name/` folder;
 * single-release archives stay flat. Extended mixes go in an `Extended/`
 * subfolder. A full-release purchase also includes the release's cover art file
 * alongside its tracks — plus a copy inside `Extended/` when that subfolder
 * exists; à la carte track purchases get no cover art.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
  const trackIdsParam = req.nextUrl.searchParams.get("trackIds");
  const format = req.nextUrl.searchParams.get("format") || "mp3";
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
    return NextResponse.json({ error: "Invalid download link" }, { status: 404 });
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
      return NextResponse.json({ error: "Track not in order" }, { status: 403 });
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
      return NextResponse.json({ error: "Release not in order" }, { status: 403 });
    }

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        tracks: {
          orderBy: { trackNumber: "asc" },
          include: {
            files: { where: { format } },
          },
        },
      },
    });

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    trackFiles = release.tracks
      .filter((t) => t.files.length > 0)
      .map((track) => ({
        fileName: zipEntryPath(null, track.files[0].fileName),
        storageKey: track.files[0].storageKey,
        contentType: audioContentType,
      }));
    // Full-release download — include the cover art alongside the tracks.
    if (trackFiles.length > 0 && release.coverImageUrl) {
      trackFiles.push(
        ...coverArtEntries(release.name, release.coverImageUrl, "", trackFiles),
      );
    }

    zipName = `${release.name} (${format.toUpperCase()}).zip`;
  }

  if (trackFiles.length === 0) {
    return NextResponse.json(
      { error: "No audio files have been uploaded for these tracks yet." },
      { status: 404 },
    );
  }

  const files = await Promise.all(
    trackFiles.map(async (t) => ({
      fileName: t.fileName,
      url: await getPresignedDownloadUrl(t.storageKey, {
        filename: t.fileName.split("/").pop() ?? t.fileName,
        contentType: t.contentType,
      }),
    })),
  );

  return NextResponse.json({ zipName, files });
}
