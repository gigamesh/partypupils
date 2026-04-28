import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import archiver from "archiver";
import { PassThrough } from "stream";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
    const trackIdsParam = req.nextUrl.searchParams.get("trackIds");
    const format = req.nextUrl.searchParams.get("format") || "mp3";

    if (!releaseId && !trackIdsParam) {
      return NextResponse.json({ error: "Missing releaseId or trackIds" }, { status: 400 });
    }

    const downloadToken = await prisma.downloadToken.findUnique({
      where: { token },
      include: {
        order: {
          include: {
            items: {
              include: {
                release: { include: { tracks: true } },
              },
            },
          },
        },
      },
    });

    if (!downloadToken) {
      return NextResponse.json({ error: "Invalid download link" }, { status: 404 });
    }

    // Pre-built filename per track so the two paths (trackIds vs releaseId) can name files
    // differently — release zips get "01 - X.mp3" matching the album order; multi-track
    // zips get "Album Name - X.mp3" because cross-release numbering would be misleading.
    let trackFiles: { fileName: string; storageKey: string }[];
    let zipName: string;

    if (trackIdsParam) {
      const requestedTrackIds = trackIdsParam.split(",").map(Number);
      const orderTrackIds = new Set(
        downloadToken.order.items.filter((item) => item.trackId).map((item) => item.trackId!)
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
          fileName: `${t.release.name} - ${t.name}.${format}`,
          storageKey: t.files[0].storageKey,
        }));

      zipName = `Party Pupils - Tracks (${format.toUpperCase()}).zip`;
    } else {
      const orderHasRelease = downloadToken.order.items.some(
        (item) => item.releaseId === releaseId
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
          fileName: `${String(track.trackNumber).padStart(2, "0")} - ${track.name}.${format}`,
          storageKey: track.files[0].storageKey,
        }));

      zipName = `${release.name} (${format.toUpperCase()}).zip`;
    }

    if (trackFiles.length === 0) {
      return NextResponse.json(
        { error: "No audio files have been uploaded for these tracks yet." },
        { status: 404 }
      );
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const archive = archiver("zip", { zlib: { level: 0 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    (async () => {
      try {
        for await (const chunk of passthrough) {
          await writer.write(chunk);
        }
        await writer.close();
      } catch {
        await writer.abort();
      }
    })();

    (async () => {
      for (const track of trackFiles) {
        const res = await fetch(track.storageKey);
        if (!res.ok || !res.body) continue;
        archive.append(Buffer.from(await res.arrayBuffer()), { name: track.fileName });
      }
      await archive.finalize();
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (err) {
    console.error("Zip download error:", err);
    return NextResponse.json({ error: "Failed to generate zip" }, { status: 500 });
  }
}
