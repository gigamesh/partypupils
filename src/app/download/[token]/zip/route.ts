import { NextRequest, NextResponse } from "next/server";
import { presignZipFiles, resolveCustomerZip } from "@/lib/release-zip";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/**
 * Returns a JSON manifest of presigned R2 GET URLs and target filenames so the
 * client (via a Service Worker + `client-zip`) can stream the archive directly
 * from R2 without ever routing audio bytes through the Vercel function.
 *
 * The auth + file-list logic lives in `resolveCustomerZip()` so this route
 * stays byte-identical to the `/download/[token]/zip-stream` server-side
 * fallback.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
  const trackIdsParam = req.nextUrl.searchParams.get("trackIds");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  const result = await resolveCustomerZip({ token, releaseId, trackIdsParam, format });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    zipName: result.zipName,
    files: await presignZipFiles(result.files),
  });
}
