import { copyFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * Copy the ffmpeg-static binary into ./bin/ffmpeg so it lands at a stable,
 * non-symlinked project path. Next's output file tracing handles a plain
 * project file reliably; pnpm's symlinked node_modules layout it does not.
 */
if (!ffmpegStatic) {
  throw new Error(
    `ffmpeg-static has no prebuilt binary for ${process.platform}/${process.arch}`,
  );
}
const dest = resolve(process.cwd(), "bin", "ffmpeg");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(ffmpegStatic, dest);
chmodSync(dest, 0o755);
if (!existsSync(dest)) throw new Error(`failed to materialize ${dest}`);
console.log(`Copied ffmpeg → ${dest}`);
