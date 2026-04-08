import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

/** Convert a WAV buffer to MP3 at the given bitrate (e.g. "128k", "320k"). */
export async function convertToMp3(wavBuffer: Buffer, bitrate: string): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-input.wav`);
  const outputPath = join(tmpdir(), `${id}-output.mp3`);

  await writeFile(inputPath, wavBuffer);

  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", [
      "-i", inputPath,
      "-b:a", bitrate,
      "-y",
      outputPath,
    ], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const mp3Buffer = await readFile(outputPath);

  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  return mp3Buffer;
}

/** Generate a 128kbps preview MP3 from a WAV buffer. */
export async function generatePreview(wavBuffer: Buffer): Promise<Buffer> {
  return convertToMp3(wavBuffer, "128k");
}
