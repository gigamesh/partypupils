import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackFiles } from "@/db/schema";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { cleanDownloadFilename } from "@/lib/utils";

/**
 * Admin-only mirror of the customer `/download/[token]` flow: 302s to a
 * presigned R2 URL whose response headers force a same-tab download with the
 * right filename and MIME type. Used by the admin release-edit form so admins
 * don't have to dig out R2 URLs by hand.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trackId = parseInt(req.nextUrl.searchParams.get("trackId") || "0");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  if (!trackId) {
    return NextResponse.json({ error: "Missing trackId" }, { status: 400 });
  }

  const file = await db.query.trackFiles.findFirst({
    where: and(eq(trackFiles.trackId, trackId), eq(trackFiles.format, format)),
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const url = await getPresignedDownloadUrl(file.storageKey, {
    filename: cleanDownloadFilename(file.fileName),
    contentType: format === "wav" ? "audio/wav" : "audio/mpeg",
  });
  return NextResponse.redirect(url, 302);
}
