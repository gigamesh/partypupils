import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const BITRATE = "128k";

export async function generatePreview(wavBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-input.wav`);
  const outputPath = join(tmpdir(), `${id}-preview.mp3`);

  await writeFile(inputPath, wavBuffer);

  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", [
      "-i", inputPath,
      "-b:a", BITRATE,
      "-y",
      outputPath,
    ], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const previewBuffer = await readFile(outputPath);

  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  return previewBuffer;
}
