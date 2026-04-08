import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const trackId = parseInt(req.nextUrl.searchParams.get("trackId") || "0");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
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

  const orderHasTrack = downloadToken.order.items.some((item) => {
    if (item.trackId === trackId) return true;
    if (item.release?.tracks.some((t) => t.id === trackId)) return true;
    return false;
  });

  if (!orderHasTrack) {
    return NextResponse.json({ error: "Track not in order" }, { status: 403 });
  }

  const file = await prisma.trackFile.findFirst({
    where: { trackId, format },
    include: { track: true },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const res = await fetch(file.storageKey);
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  }

  const fileName = `${file.track.name}.${format}`;

  return new Response(res.body, {
    headers: {
      "Content-Type": format === "wav" ? "audio/wav" : "audio/mpeg",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
