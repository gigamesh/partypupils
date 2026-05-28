import type { NextRequest } from "next/server";
import * as audio from "@gigamusic/audio";
import {
  createAdminUploadProcessHandler,
  type AdminDeps,
} from "@gigamusic/admin/server";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";
import { env } from "@/lib/env";

export const maxDuration = 300;

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// The process handler reads `storage`, `audio`, `queries`, and
// `adminSessionSecret`. `queries` is only touched when the request body
// includes a numeric `trackId` (party-pupils' upload form never sets one
// today — track-file rows get persisted by the release POST/PUT — so the
// queries delegate is effectively unused but supplied for forward compat).
//
// Behaviour diff vs. the prior in-house route: the WAV is now retagged in
// place after transcoding, so the bucket's .wav object carries ID3 tags
// (TPE2-strip enforced by @gigamusic/audio's type-level guarantee). The
// extra `wavUrl` / `wavFileSize` / `mp3FileSize` fields the package
// returns are ignored by the consumer form — only `mp3Url` is read.
const handler = createAdminUploadProcessHandler({
  storage: storageProvider(),
  audio,
  queries,
  adminSessionSecret: env.ADMIN_SECRET(),
} as unknown as AdminDeps);

export function POST(req: NextRequest) {
  return handler(req);
}
