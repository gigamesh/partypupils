/**
 * Lossless WAV retagging.
 *
 * ffmpeg's WAV muxer is single-stream, so it can neither embed nor preserve cover
 * art in a WAV. Instead we copy the audio losslessly into a clean container (with
 * RIFF INFO text tags) and then splice in the ID3v2 tag that ffmpeg already produced
 * for the matching MP3 — text frames *and* the APIC picture — as an `id3 ` RIFF
 * chunk. `music-metadata` and ffprobe both read that back, and the PCM audio is
 * bit-identical to the source.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { ffmpegBinary, metadataArgs, type Mp3Metadata } from "./preview";

/**
 * Slice the leading ID3v2 tag off an MP3 buffer (ID3v2.3, as written by
 * `convertWavStreamToMp3`). Returns null when there is no ID3v2 tag.
 */
export function extractId3v2Tag(mp3: Buffer): Buffer | null {
  if (mp3.length < 10 || mp3.toString("latin1", 0, 3) !== "ID3") return null;
  // Header bytes 6-9 are a synchsafe (7-bit/byte) size of the tag body, excluding
  // the 10-byte header itself.
  const bodySize = (mp3[6] << 21) | (mp3[7] << 14) | (mp3[8] << 7) | mp3[9];
  const total = 10 + bodySize;
  return total <= mp3.length ? mp3.subarray(0, total) : null;
}

/** ffmpeg: copy a WAV's audio into a fresh container, dropping stale chunks, with RIFF INFO text tags. */
function remuxWavAudio(
  srcPath: string,
  outPath: string,
  metadata?: Mp3Metadata,
): Promise<void> {
  const args = [
    "-i", srcPath,
    "-map", "0:a",
    "-c:a", "copy",
    "-map_metadata", "-1",
    ...metadataArgs(metadata),
    "-y", outPath,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Rewrite a WAV's metadata losslessly: copy the audio into a clean container with
 * RIFF INFO text tags, then append `id3v2Tag` as an `id3 ` RIFF chunk so the WAV
 * also carries full ID3v2 metadata + cover art. The PCM audio is bit-identical to
 * the source; `album_artist` is never written.
 */
export async function retagWav(opts: {
  srcWavPath: string;
  outWavPath: string;
  metadata?: Mp3Metadata;
  id3v2Tag?: Buffer | null;
}): Promise<void> {
  await remuxWavAudio(opts.srcWavPath, opts.outWavPath, opts.metadata);

  const tag = opts.id3v2Tag;
  if (!tag || tag.length === 0) return;

  const wav = await readFile(opts.outWavPath);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write("id3 ", 0, "latin1");
  chunkHeader.writeUInt32LE(tag.length, 4);
  // RIFF chunks are word-aligned: pad an odd-length body with a trailing zero byte.
  const pad = tag.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  const out = Buffer.concat([wav, chunkHeader, tag, pad]);
  // Fix the top-level RIFF size (bytes 4-7): total file size minus the 8-byte RIFF header.
  out.writeUInt32LE(out.length - 8, 4);
  await writeFile(opts.outWavPath, out);
}
