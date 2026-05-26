import type { NextConfig } from "next";

const r2Hostname = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
  // @gigamusic/* packages are linked via `link:../gigamusic/packages/*` and
  // some of them (notably `links` and `config`) ship raw TypeScript sources
  // from their package "main". Listing them in `transpilePackages` tells
  // Next.js (and Turbopack) to follow the symlinks and compile their `src/`.
  transpilePackages: [
    "@gigamusic/admin",
    "@gigamusic/audio",
    "@gigamusic/checkout",
    "@gigamusic/config",
    "@gigamusic/core",
    "@gigamusic/db",
    "@gigamusic/email",
    "@gigamusic/links",
    "@gigamusic/storage",
    "@gigamusic/ui",
  ],
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
  // intact for the dev fallback in preview.ts.
  serverExternalPackages: ["ffmpeg-static"],
  // In production we don't trust the package-resolved path through pnpm's
  // symlinks. scripts/prepare-ffmpeg.mjs copies the binary to ./bin/ffmpeg at
  // build time and preview.ts spawns from there; this entry bundles it.
  outputFileTracingIncludes: {
    "/api/admin/upload/process": ["./bin/ffmpeg"],
  },
};

export default nextConfig;
