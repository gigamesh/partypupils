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
  // ffmpeg-static exports the absolute path to its prebuilt binary as a string.
  // Bundlers (Turbopack/Webpack) rewrite that string to a virtual `/ROOT/...` path
  // during build, which then fails at spawn time. Keeping ffmpeg-static external
  // means the path is resolved at runtime against the actual node_modules.
  serverExternalPackages: ["ffmpeg-static"],
  // Force the ffmpeg-static binary into the upload route's function bundle —
  // Next's static tracing won't follow the runtime path lookup inside the package.
  outputFileTracingIncludes: {
    "/api/admin/upload/process": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
