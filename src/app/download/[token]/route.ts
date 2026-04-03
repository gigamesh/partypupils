import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const productId = parseInt(req.nextUrl.searchParams.get("productId") || "0");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  const downloadToken = await prisma.downloadToken.findUnique({
    where: { token },
    include: {
      order: {
        include: {
          items: true,
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

  const orderHasProduct = downloadToken.order.items.some(
    (item) => item.productId === productId
  );
  if (!orderHasProduct) {
    return NextResponse.json({ error: "Product not in order" }, { status: 403 });
  }

  const file = await prisma.productFile.findFirst({
    where: { productId, format },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await prisma.downloadToken.update({
    where: { id: downloadToken.id },
    data: { downloadCount: { increment: 1 } },
  });

  // In production, the storageKey is a Vercel Blob URL. Redirect to it.
  // For additional security, you could generate a signed URL with a short expiry.
  return NextResponse.redirect(file.storageKey);
}
