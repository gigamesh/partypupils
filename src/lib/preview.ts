import { spawn } from "child_process";
import { Readable } from "stream";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * Resolve the ffmpeg binary path. In production we use ./bin/ffmpeg (placed
 * there by scripts/prepare-ffmpeg.mjs at build time) so the bundle has a
 * stable, non-symlinked path that Vercel's tracer can include reliably. In
 * dev we fall back to the ffmpeg-static package path.
 */
export function ffmpegBinary(): string {
  if (process.env.NODE_ENV === "production") {
    const bundled = resolve(process.cwd(), "bin", "ffmpeg");
    if (existsSync(bundled)) return bundled;
    // Falls through to ffmpeg-static — e.g. a maintenance script run locally with a
    // prod env file where ./bin/ffmpeg (a build artifact) isn't present.
  }
  if (!ffmpegStatic) {
    throw new Error(
      `ffmpeg-static has no prebuilt binary for ${process.platform}/${process.arch}`
    );
  }
  return ffmpegStatic;
}

export interface Mp3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  trackNumber?: number;
  trackTotal?: number;
  year?: number;
}

/** Build the `-metadata key=value` flag pairs ffmpeg needs, skipping empty values. */
export function metadataArgs(meta?: Mp3Metadata): string[] {
  if (!meta) return [];
  const pairs: Array<[string, string]> = [];
  if (meta.title) pairs.push(["title", meta.title]);
  if (meta.artist) pairs.push(["artist", meta.artist]);
  if (meta.album) pairs.push(["album", meta.album]);
  if (meta.genre) pairs.push(["genre", meta.genre]);
  if (meta.trackNumber != null) {
    const value =
      meta.trackTotal != null
        ? `${meta.trackNumber}/${meta.trackTotal}`
        : String(meta.trackNumber);
    pairs.push(["track", value]);
  }
  if (meta.year != null) pairs.push(["date", String(meta.year)]);
  // Note: album_artist is deliberately never written — it must stay unpopulated.
  return pairs.flatMap(([k, v]) => ["-metadata", `${k}=${v}`]);
}

export interface ConvertOptions {
  /** Streamed WAV source, piped to ffmpeg's stdin. */
  wavStream: Readable;
  /** Destination file for the MP3. Must be a real (seekable) path. */
  mp3Path: string;
  bitrate: string;
  metadata?: Mp3Metadata;
  /** Optional image file embedded as the MP3's cover art (APIC frame). */
  coverPath?: string;
}

/**
 * Transcode a streamed WAV into an MP3 written to `mp3Path`. The output must be a
 * real file, not a pipe: ffmpeg corrupts an artwork-embedded MP3 when it can't
 * seek the output. ID3v2.3 tags are written for broad player compatibility, and
 * `coverPath`, when given, is muxed in as the cover image. Resolves on a clean
 * ffmpeg exit; rejects with the stderr tail otherwise.
 */
export function convertWavStreamToMp3({
  wavStream,
  mp3Path,
  bitrate,
  metadata,
  coverPath,
}: ConvertOptions): Promise<void> {
  const args = [
    "-i", "pipe:0",
    ...(coverPath ? ["-i", coverPath] : []),
    ...(coverPath
      ? ["-map", "0:a", "-map", "1:v", "-c:v", "mjpeg", "-disposition:v:0", "attached_pic"]
      : []),
    "-f", "mp3",
    "-b:a", bitrate,
    "-id3v2_version", "3",
    "-write_id3v1", "1",
    ...metadataArgs(metadata),
    "-y", mp3Path,
  ];

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { stdio: ["pipe", "ignore", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      // Keep the tail; ffmpeg can be chatty during normal encodes.
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    wavStream.on("error", fail);
    wavStream.pipe(proc.stdin);
    proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
      // EPIPE happens when ffmpeg exits before consuming all input; the close
      // handler below surfaces the real error.
      if (err.code !== "EPIPE") fail(err);
    });

    proc.on("error", fail);
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
