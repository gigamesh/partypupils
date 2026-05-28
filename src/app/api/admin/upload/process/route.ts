import type { NextRequest } from "next/server";
import * as audio from "@gigamusic/audio";
import { createAdminUploadProcessHandler } from "@gigamusic/admin/server";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

export const maxDuration = 300;

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

const handler = createAdminUploadProcessHandler({
  storage: storageProvider(),
  audio,
  queries,
});

export function POST(req: NextRequest) {
  return handler(req);
}
