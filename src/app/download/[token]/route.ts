import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPresignedDownloadUrl } from "@/lib/storage";

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

  // 302 to a presigned R2 GET URL with response-header overrides baked into
  // the signature. Bytes flow R2 → user directly; the function never sees the
  // audio body. The browser still triggers a same-tab download because R2's
  // response carries `Content-Disposition: attachment`.
  const url = await getPresignedDownloadUrl(file.storageKey, {
    filename: `${file.track.name}.${format}`,
    contentType: format === "wav" ? "audio/wav" : "audio/mpeg",
  });
  return NextResponse.redirect(url, 302);
}
