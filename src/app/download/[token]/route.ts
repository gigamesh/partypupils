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

  if (new Date() > downloadToken.expiresAt) {
    return NextResponse.json({ error: "Download link has expired" }, { status: 410 });
  }

  if (downloadToken.downloadCount >= downloadToken.maxDownloads) {
    return NextResponse.json({ error: "Download limit reached" }, { status: 429 });
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
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.downloadToken.update({
    where: { id: downloadToken.id },
    data: { downloadCount: { increment: 1 } },
  });

  return NextResponse.redirect(file.storageKey);
}
