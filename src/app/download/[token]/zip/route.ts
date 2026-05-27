import type { NextRequest } from "next/server";
import { createDownloadZipHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Returns the JSON manifest the service worker (shipped from `@gigamusic/ui`'s
// `public/sw-zip.js`) consumes — the SW pipes presigned R2 URLs through
// `client-zip` and streams the archive straight from R2 to the browser.
const handler = createDownloadZipHandler({ queries, storage: storageProvider() });

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
