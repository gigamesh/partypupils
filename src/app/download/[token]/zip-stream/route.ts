import type { NextRequest } from "next/server";
import { createDownloadZipStreamHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";
import { SITE_NAME } from "@/lib/constants";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

const handler = createDownloadZipStreamHandler({
  queries,
  storage: storageProvider(),
  zipNamePrefix: SITE_NAME,
});

export const runtime = "nodejs";
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
