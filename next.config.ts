import type { NextConfig } from "next";

const r2Hostname = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
  // @gigamusic/{admin,links} ship as raw TS source (Type B in gigamusic's
  // packaging convention) and rely on the consumer's Next compiler to handle
  // their `"use client"` directives and JSX.
  transpilePackages: ["@gigamusic/admin", "@gigamusic/links"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: r2Hostname,
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // ffmpeg-static exports the absolute path to its binary as a string. Bundlers
  // (Turbopack/Webpack) rewrite that string to a virtual `/ROOT/...` path that
  // doesn't exist at spawn time. Marking the package external keeps the path
  // intact for `@gigamusic/audio`'s dev fallback.
  //
  // `ws` is the WebSocket transport for `@neondatabase/serverless`. Webpack's
  // minifier mangles its internal `bufferUtil.mask` call ("b.mask is not a
  // function" at runtime). Externalizing it sidesteps the minifier entirely.
  // `bufferutil` and `utf-8-validate` are its optional native deps.
  serverExternalPackages: ["ffmpeg-static", "ws", "bufferutil", "utf-8-validate"],
  // In production we don't trust the package-resolved path through pnpm's
  // symlinks. scripts/prepare-ffmpeg.mjs copies the binary to ./bin/ffmpeg at
  // build time and `@gigamusic/audio` spawns from there; this entry bundles it.
  outputFileTracingIncludes: {
    "/api/admin/upload/process": ["./bin/ffmpeg"],
  },
};

export default nextConfig;
