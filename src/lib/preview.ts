import { Readable } from "stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { transcodeWavToMp3, type AudioTags } from "@gigamusic/audio";

/**
 * Party-pupils-shaped MP3 metadata. Kept as a separate alias rather than
 * re-exporting `@gigamusic/audio.AudioTags` because party-pupils' historical
 * shape uses `year: number` while `AudioTags` uses `date: string` — the
 * conversion happens in `toAudioTags` below.
 */
export interface Mp3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  trackNumber?: number;
  trackTotal?: number;
  year?: number;
}

/**
 * Translate party-pupils' historical metadata shape into `@gigamusic/audio`'s
 * `AudioTags`. `AudioTags` requires `title` + `artist`; party-pupils' admin
 * upload UI can submit either empty, so we drop the tag block entirely when
 * both are missing. `year` becomes a 4-digit `date` string.
 */
function toAudioTags(meta?: Mp3Metadata): AudioTags | undefined {
  if (!meta) return undefined;
  const title = meta.title?.trim();
  const artist = meta.artist?.trim();
  if (!title && !artist) return undefined;
  return {
    title: title ?? "",
    artist: artist ?? "",
    album: meta.album?.trim() || undefined,
    genre: meta.genre?.trim() || undefined,
    trackNumber: meta.trackNumber,
    trackTotal: meta.trackTotal,
    date: meta.year != null ? String(meta.year) : undefined,
  };
}

export interface ConvertOptions {
  /** Streamed WAV source. Buffered to a temp file before transcoding. */
  wavStream: Readable;
  /** Destination file for the MP3. Must be a real (seekable) path. */
  mp3Path: string;
  /** Bitrate string like "320k". Numeric kbps is derived from the leading digits. */
  bitrate: string;
  metadata?: Mp3Metadata;
  /** Optional image file embedded as the MP3's cover art (APIC frame). */
  coverPath?: string;
}

/**
 * Transcode a streamed WAV into an MP3 written to `mp3Path`. Delegates to
 * `@gigamusic/audio.transcodeWavToMp3`, which takes file paths — so the stream
 * is buffered to a temp WAV and the optional cover image is read into a Buffer
 * before handoff. Public signature is unchanged from the original party-pupils
 * `convertWavStreamToMp3`; callers (admin upload, retag) don't move.
 */
export async function convertWavStreamToMp3({
  wavStream,
  mp3Path,
  bitrate,
  metadata,
  coverPath,
}: ConvertOptions): Promise<void> {
  const tmpWav = join(tmpdir(), `${randomUUID()}.wav`);
  try {
    await pipeline(wavStream, createWriteStream(tmpWav));
    const coverArt = coverPath ? await readFile(coverPath) : undefined;
    const bitrateKbps = parseBitrateKbps(bitrate);
    await transcodeWavToMp3({
      inputPath: tmpWav,
      outputPath: mp3Path,
      tags: toAudioTags(metadata),
      coverArt,
      bitrateKbps,
    });
  } finally {
    await unlink(tmpWav).catch(() => {});
  }
}

/** Pull the leading numeric kbps out of strings like "320k" / "192kbps" / "256". */
function parseBitrateKbps(bitrate: string): number {
  const match = /^(\d+)/.exec(bitrate);
  return match ? parseInt(match[1], 10) : 320;
}
