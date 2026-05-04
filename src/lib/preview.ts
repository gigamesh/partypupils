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

/**
 * Spawn ffmpeg with WAV-on-stdin → MP3-on-stdout at the given bitrate. The
 * returned Readable is wired so that ffmpeg's exit code propagates as a stream
 * error (caller will see it on the upload side).
 */
export function convertWavStreamToMp3(input: Readable, bitrate: string): Readable {
  const proc = spawn(
    ffmpegBinary(),
    ["-i", "pipe:0", "-f", "mp3", "-b:a", bitrate, "pipe:1"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

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
