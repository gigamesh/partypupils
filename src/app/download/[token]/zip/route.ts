import type { NextRequest } from "next/server";
import { createDownloadZipHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";
import { SITE_NAME } from "@/lib/constants";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Returns the JSON manifest the `/sw-zip.js` service worker consumes —
// not the archive itself. The SW streams the zip straight from R2.
const handler = createDownloadZipHandler({
  queries,
  storage: storageProvider(),
  zipNamePrefix: SITE_NAME,
});

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
