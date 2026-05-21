import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  getFileBuffer,
  getFileStream,
  keyFromPublicUrl,
  uploadStream,
} from "@/lib/storage";
import { convertWavStreamToMp3, type Mp3Metadata } from "@/lib/preview";

export const maxDuration = 300;

/**
 * Coerce arbitrary client input into a clean Mp3Metadata object (or undefined).
 * String fields are trimmed: stray whitespace (e.g. a trailing space in the
 * artist) embeds into the file and makes players like Apple Music treat
 * otherwise-identical tracks as belonging to separate albums.
 */
function parseMetadata(raw: unknown): Mp3Metadata | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: Mp3Metadata = {};
  if (typeof r.title === "string" && r.title.trim()) out.title = r.title.trim();
  if (typeof r.artist === "string" && r.artist.trim()) out.artist = r.artist.trim();
  if (typeof r.album === "string" && r.album.trim()) out.album = r.album.trim();
  if (typeof r.genre === "string" && r.genre.trim()) out.genre = r.genre.trim();
  if (typeof r.trackNumber === "number") out.trackNumber = r.trackNumber;
  if (typeof r.trackTotal === "number") out.trackTotal = r.trackTotal;
  if (typeof r.year === "number") out.year = r.year;
  return Object.keys(out).length ? out : undefined;
}

/** Decode a `data:<mime>;base64,<data>` URL into a Buffer, or return null. */
function bufferFromDataUrl(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  const match = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
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

  // Cover art: the WAV's own embedded picture (sent by the form) wins; the
  // release cover image is the fallback.
  let artBuffer = bufferFromDataUrl(body.artDataUrl);
  if (!artBuffer && typeof body.coverImageUrl === "string" && body.coverImageUrl) {
    try {
      artBuffer = await getFileBuffer(keyFromPublicUrl(body.coverImageUrl));
    } catch (err) {
      console.warn("Cover image fetch failed; proceeding without artwork:", err);
    }
  }

  const tmpId = randomUUID();
  const mp3Path = join(tmpdir(), `${tmpId}.mp3`);
  const coverPath = artBuffer ? join(tmpdir(), `${tmpId}.img`) : undefined;

  try {
    if (artBuffer && coverPath) {
      await writeFile(coverPath, artBuffer);
    }
    const wavStream = await getFileStream(key);
    await convertWavStreamToMp3({
      wavStream,
      mp3Path,
      bitrate: "320k",
      metadata,
      coverPath,
    });
    const { url } = await uploadStream(
      createReadStream(mp3Path),
      mp3Key,
      "audio/mpeg"
    );
    return NextResponse.json({ mp3Url: url });
  } catch (err) {
    console.error("MP3 generation failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Transcoding failed", mp3Error: message },
      { status: 500 }
    );
  } finally {
    await Promise.allSettled([
      unlink(mp3Path),
      coverPath ? unlink(coverPath) : Promise.resolve(),
    ]);
  }
}
