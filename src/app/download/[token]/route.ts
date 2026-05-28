import type { NextRequest } from "next/server";
import { createDownloadHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Built once at module load. Per-track presigned-URL redirect is stateless;
// the handler captures `queries` + `storage` closures and reads no env at
// request time.
const handler = createDownloadHandler({ queries, storage: storageProvider() });

interface RouteContext {
  params: Promise<{ token: string }>;
}

export function GET(req: NextRequest, ctx: RouteContext) {
  return handler(req, ctx);
}
