import type { NextRequest } from "next/server";
import { createDownloadZipStreamHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Server-side bulk-download fallback for browsers (Safari + every iOS browser,
// plus private/incognito) that can't run the service worker reliably. Audio
// bytes proxy through Vercel here — slower and costs egress, which is why the
// SW path stays the default for the engines that handle it.
const handler = createDownloadZipStreamHandler({ queries, storage: storageProvider() });

export const runtime = "nodejs";
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
