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

  // Pull only the ID columns needed to authorize ownership; previously we joined
  // release.tracks (every track of every release in the order) to walk in JS.
  const downloadToken = await prisma.downloadToken.findUnique({
    where: { token },
    select: {
      order: {
        select: {
          items: { select: { trackId: true, releaseId: true } },
        },
      },
    },
  });

  if (!downloadToken) {
    return NextResponse.json({ error: "Invalid download link" }, { status: 404 });
  }

  const file = await prisma.trackFile.findFirst({
    where: { trackId, format },
    include: { track: { select: { name: true, releaseId: true } } },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const orderHasTrack = downloadToken.order.items.some(
    (item) => item.trackId === trackId || item.releaseId === file.track.releaseId,
  );

  if (!orderHasTrack) {
    return NextResponse.json({ error: "Track not in order" }, { status: 403 });
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
