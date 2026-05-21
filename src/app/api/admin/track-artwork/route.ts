import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getFileBuffer, keyFromPublicUrl } from "@/lib/storage";

export const maxDuration = 60;

/**
 * Serves the cover art actually embedded in a track's generated MP3 — the
 * source of truth for the artwork a track carries. Falls back to the release
 * cover when the MP3 has no embedded picture (e.g. tracks predating artwork
 * embedding). The admin release-edit form points its per-track thumbnails here
 * since, on a fresh page load, it has no other way to know a saved track's art.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackId = parseInt(req.nextUrl.searchParams.get("trackId") || "0");
  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: {
      files: { where: { format: "mp3" } },
      release: { select: { coverImageUrl: true } },
    },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const mp3 = track.files[0];
  if (mp3) {
    try {
      const buf = await getFileBuffer(keyFromPublicUrl(mp3.storageKey));
      const { parseBuffer } = await import("music-metadata");
      const { common } = await parseBuffer(buf, { mimeType: "audio/mpeg" });
      const picture = common.picture?.[0];
      if (picture) {
        return new NextResponse(Buffer.from(picture.data), {
          headers: {
            "Content-Type": picture.format || "image/jpeg",
            "Cache-Control": "private, max-age=300",
          },
        });
      }
    } catch (err) {
      console.warn(`track-artwork: could not read MP3 art for track ${trackId}:`, err);
    }
  }

  // No embedded picture — fall back to the release cover image.
  if (track.release.coverImageUrl) {
    return NextResponse.redirect(track.release.coverImageUrl, 302);
  }
  return NextResponse.json({ error: "No artwork" }, { status: 404 });
}
