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
    const format = req.nextUrl.searchParams.get("format") || "mp3";

    if (!releaseId) {
      return NextResponse.json({ error: "Missing releaseId" }, { status: 400 });
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

    const trackFiles = release.tracks
      .map((track) => ({
        name: track.name,
        trackNumber: track.trackNumber,
        file: track.files[0],
      }))
      .filter((t) => t.file);

    if (trackFiles.length === 0) {
      return NextResponse.json(
        { error: "No audio files have been uploaded for this release yet." },
        { status: 404 }
      );
    }

    const passthrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 0 } });

    archive.pipe(passthrough);

    for (const track of trackFiles) {
      const res = await fetch(track.file.storageKey);
      if (!res.ok || !res.body) continue;

      const fileName = `${String(track.trackNumber).padStart(2, "0")} - ${track.name}.${format}`;
      archive.append(Buffer.from(await res.arrayBuffer()), { name: fileName });
    }

    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const zipBuffer = Buffer.concat(chunks);

    const zipName = `${release.name} (${format.toUpperCase()}).zip`;

    return new NextResponse(zipBuffer, {
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
