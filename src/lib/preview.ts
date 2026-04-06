import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const PREVIEW_DURATION = 100;
const FADE_DURATION = 10;
const FADE_START = PREVIEW_DURATION - FADE_DURATION;
const BITRATE = "320k";

export async function generatePreview(wavBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-input.wav`);
  const outputPath = join(tmpdir(), `${id}-preview.mp3`);

  await writeFile(inputPath, wavBuffer);

  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", [
      "-i", inputPath,
      "-t", String(PREVIEW_DURATION),
      "-af", `afade=t=out:st=${FADE_START}:d=${FADE_DURATION}:curve=esin`,
      "-b:a", BITRATE,
      "-y",
      outputPath,
    ], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const previewBuffer = await readFile(outputPath);

  // Clean up temp files
  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  return previewBuffer;
}
