import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getPresignedUploadUrl } from "@/lib/storage";

// Path segments allow the punctuation common in real-world track filenames
// (apostrophes, ampersands, commas, plus, brackets, exclamation, equals)
// alongside alphanumerics, dashes, dots, underscores, spaces, parens, and
// slashes. Must start with a known top-level prefix and end with one of the
// allowed extensions (case-insensitive). Path traversal is blocked separately.
const KEY_RE =
  /^(audio|images|uploads)\/[A-Za-z0-9_.\-() /'&,!+\[\]=]+\.(wav|mp3|jpg|jpeg|png|webp)$/i;

const ALLOWED_CONTENT_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "image/jpeg",
  "image/png",
  "image/webp",
  // Browsers often serve .wav as octet-stream when the OS has no registered
  // audio/wav handler; the client falls back to this.
  "application/octet-stream",
]);

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key, contentType } = await req.json();

  if (typeof key !== "string" || typeof contentType !== "string") {
    return NextResponse.json(
      { error: "key and contentType are required" },
      { status: 400 }
    );
  }
  if (key.includes("..") || !KEY_RE.test(key)) {
    return NextResponse.json(
      { error: "Invalid key — must be under audio/, images/, or uploads/ with an allowed extension" },
      { status: 400 }
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Unsupported contentType: ${contentType}` },
      { status: 400 }
    );
  }

  const result = await getPresignedUploadUrl(key, contentType);
  return NextResponse.json(result);
}
