import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { cleanDownloadFilename } from "@/lib/utils";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/** Strip path separators so a release/track name can't spawn unintended zip subfolders. */
function sanitizeSegment(name: string): string {
  return name.replace(/[/\\]+/g, "-").trim();
}

/**
 * Returns a JSON manifest of presigned R2 GET URLs and target filenames so the
 * client (via a Service Worker + `client-zip`) can stream the archive directly
 * from R2 without ever routing audio bytes through the Vercel function.
 *
 * Multi-release archives nest each track under a `Release Name/` folder;
 * single-release archives stay flat. Either way the entry keeps the original
 * uploaded filename (whitespace-trimmed) — no track-number prefix is added,
 * since some uploaded filenames already carry their own numbering.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
  const trackIdsParam = req.nextUrl.searchParams.get("trackIds");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

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

  let trackFiles: { fileName: string; storageKey: string }[];
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
        fileName: `${sanitizeSegment(t.release.name)}/${cleanDownloadFilename(t.files[0].fileName)}`,
        storageKey: t.files[0].storageKey,
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

    const releaseFiles = releases.flatMap((release) =>
      release.tracks
        .filter((t) => t.files.length > 0)
        .map((track) => ({
          fileName: `${sanitizeSegment(release.name)}/${cleanDownloadFilename(track.files[0].fileName)}`,
          storageKey: track.files[0].storageKey,
        })),
    );
    const aLaCarteFiles = aLaCarteTracks
      .filter((t) => t.files.length > 0)
      .map((t) => ({
        fileName: `${sanitizeSegment(t.release.name)}/${cleanDownloadFilename(t.files[0].fileName)}`,
        storageKey: t.files[0].storageKey,
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
        fileName: cleanDownloadFilename(track.files[0].fileName),
        storageKey: track.files[0].storageKey,
      }));

    zipName = `${release.name} (${format.toUpperCase()}).zip`;
  }

  if (trackFiles.length === 0) {
    return NextResponse.json(
      { error: "No audio files have been uploaded for these tracks yet." },
      { status: 404 },
    );
  }

  const contentType = format === "wav" ? "audio/wav" : "audio/mpeg";
  const files = await Promise.all(
    trackFiles.map(async (t) => ({
      fileName: t.fileName,
      url: await getPresignedDownloadUrl(t.storageKey, {
        filename: t.fileName.split("/").pop() ?? t.fileName,
        contentType,
      }),
    })),
  );

  return NextResponse.json({ zipName, files });
}
