import type { NextRequest } from "next/server";
import { createDownloadHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

const handler = createDownloadHandler({ queries, storage: storageProvider() });

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
