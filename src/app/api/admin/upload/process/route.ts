import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import { getFileStream, uploadStream } from "@/lib/storage";
import { convertWavStreamToMp3, type Mp3Metadata } from "@/lib/preview";

export const maxDuration = 300;

/** Coerce arbitrary client input into a clean Mp3Metadata object (or undefined). */
function parseMetadata(raw: unknown): Mp3Metadata | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Mp3Metadata = {};
  if (typeof r.title === "string") out.title = r.title;
  if (typeof r.artist === "string") out.artist = r.artist;
  if (typeof r.album === "string") out.album = r.album;
  if (typeof r.trackNumber === "number") out.trackNumber = r.trackNumber;
  if (typeof r.trackTotal === "number") out.trackTotal = r.trackTotal;
  if (typeof r.year === "number") out.year = r.year;
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { key } = body;
  const metadata = parseMetadata(body.metadata);

  if (!key || typeof key !== "string" || !key.endsWith(".wav")) {
    return NextResponse.json(
      { error: "A .wav storage key is required" },
      { status: 400 }
    );
  }

  const mp3Key = key.replace(/\.wav$/i, ".mp3");

  try {
    const wavStream = await getFileStream(key);
    const mp3Stream = convertWavStreamToMp3(wavStream, "320k", metadata);
    const { url } = await uploadStream(mp3Stream, mp3Key, "audio/mpeg");
    return NextResponse.json({ mp3Url: url });
  } catch (err) {
    console.error("MP3 generation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Transcoding failed", mp3Error: message },
      { status: 500 }
    );
  }
}
