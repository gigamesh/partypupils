import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { buildReleaseZipBundle, presignZipFiles } from "@/lib/release-zip";

/**
 * Admin-only zip manifest. Mirrors the customer `/download/[token]/zip`
 * single-release flow — same folder layout, `Extended/` split and cover art —
 * but gated by the admin session instead of a download token, so the
 * release-edit page can download a release exactly as a customer would.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  if (!releaseId) {
    return NextResponse.json({ error: "Missing releaseId" }, { status: 400 });
  }

  const bundle = await buildReleaseZipBundle(releaseId, format);
  if (!bundle) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }
  // An empty bundle means no file matched `format`, which is a different
  // situation from an empty release now that MP3-only releases exist: asking a
  // DJ mix for its WAVs is a miss, not a release that's missing its uploads.
  if (bundle.files.length === 0) {
    return NextResponse.json(
      {
        error: `No ${format.toUpperCase()} files exist for this release.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    zipName: bundle.zipName,
    files: await presignZipFiles(bundle.files),
  });
}
