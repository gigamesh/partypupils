import type { NextRequest } from "next/server";
import * as audio from "@gigamusic/audio";
import { createAdminUploadProcessHandler } from "@gigamusic/admin/server";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { storageProvider } from "@/lib/storage";

export const maxDuration = 300;

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Auth is enforced upstream by `src/proxy.ts`; the package no longer
// verifies sessions inside handlers. `queries` is only touched when the
// request body includes a numeric `trackId` — party-pupils' upload form
// doesn't set one today (track files are persisted by the release
// POST/PUT). Supplied for forward compat.
//
// Behaviour note: the WAV is retagged in place after transcoding, so the
// bucket's .wav object carries ID3 tags. TPE2/`album_artist` is stripped by
// `@gigamusic/audio`'s type-level guarantee.
const handler = createAdminUploadProcessHandler({
  storage: storageProvider(),
  audio,
  queries,
});

export function POST(req: NextRequest) {
  return handler(req);
}
