import { spawn } from "child_process";
import { Readable } from "stream";
import ffmpegStatic from "ffmpeg-static";

function ffmpegBinary(): string {
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
  trackNumber?: number;
  trackTotal?: number;
  year?: number;
}

/** Build the `-metadata key=value` flag pairs ffmpeg needs, skipping empty values. */
function metadataArgs(meta?: Mp3Metadata): string[] {
  if (!meta) return [];
  const pairs: Array<[string, string]> = [];
  if (meta.title) pairs.push(["title", meta.title]);
  if (meta.artist) pairs.push(["artist", meta.artist]);
  if (meta.album) pairs.push(["album", meta.album]);
  if (meta.trackNumber != null) {
    const value =
      meta.trackTotal != null
        ? `${meta.trackNumber}/${meta.trackTotal}`
        : String(meta.trackNumber);
    pairs.push(["track", value]);
  }
  if (meta.year != null) pairs.push(["date", String(meta.year)]);
  // album_artist mirrors artist for compatibility with players that split the two.
  if (meta.artist) pairs.push(["album_artist", meta.artist]);
  return pairs.flatMap(([k, v]) => ["-metadata", `${k}=${v}`]);
}

/**
 * Spawn ffmpeg with WAV-on-stdin → MP3-on-stdout at the given bitrate. ID3v2.3
 * tags are written when metadata is supplied (broader player compatibility than
 * the v2.4 default). The returned Readable surfaces a non-zero ffmpeg exit as a
 * stream error.
 */
export function convertWavStreamToMp3(
  input: Readable,
  bitrate: string,
  metadata?: Mp3Metadata,
): Readable {
  const args = [
    "-i", "pipe:0",
    "-f", "mp3",
    "-b:a", bitrate,
    "-id3v2_version", "3",
    "-write_id3v1", "1",
    ...metadataArgs(metadata),
    "pipe:1",
  ];
  const proc = spawn(ffmpegBinary(), args, { stdio: ["pipe", "pipe", "pipe"] });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    // Keep the tail; ffmpeg can be chatty during normal encodes.
    stderr = (stderr + chunk.toString()).slice(-2000);
  });

  input.on("error", (err) => proc.stdout.destroy(err));
  input.pipe(proc.stdin);
  proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
    // EPIPE happens when ffmpeg exits before consuming all input; the exit
    // handler below will surface the real error.
    if (err.code !== "EPIPE") proc.stdout.destroy(err);
  });

  proc.on("error", (err) => proc.stdout.destroy(err));
  proc.on("close", (code) => {
    if (code !== 0) {
      proc.stdout.destroy(
        new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`),
      );
    }
  });

  return proc.stdout;
}
