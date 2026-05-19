import type { NextConfig } from "next";

const r2Hostname = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
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
  // The ffmpeg binary is copied to ./bin/ffmpeg at build time (see
  // scripts/prepare-ffmpeg.mjs) — a stable, non-symlinked project path that
  // Next's output file tracing bundles reliably into the function.
  outputFileTracingIncludes: {
    "/api/admin/upload/process": ["./bin/ffmpeg"],
  },
};

export default nextConfig;
