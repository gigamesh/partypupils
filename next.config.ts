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
  // Force the ffmpeg-static binary into the upload routes' function bundles —
  // Next's static tracing won't follow the runtime path lookup inside the package.
  outputFileTracingIncludes: {
    "/api/admin/upload": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/admin/upload/process": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
