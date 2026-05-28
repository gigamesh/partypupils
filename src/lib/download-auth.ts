import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "./db";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

export async function tokenGrantsTrack(token: string, trackId: number): Promise<boolean> {
  return queries.tokenGrantsTrack(token, trackId);
}

export async function tokenGrantsRelease(
  token: string,
  releaseId: number,
): Promise<boolean> {
  return queries.tokenGrantsRelease(token, releaseId);
}
