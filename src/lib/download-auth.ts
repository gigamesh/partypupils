import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "./db";

// Party-pupils' Prisma client is generated to src/generated/prisma but is
// structurally compatible with the one @gigamusic/db expects.
const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

/**
 * Returns true if the given download token belongs to a completed order that
 * grants access to `trackId` — either because the track was purchased
 * individually, or because its parent release was purchased.
 *
 * Shared by:
 *   - GET /download/[token]              (file delivery)
 *   - GET /music/[slug]/[trackSlug]      (decides whether to render download UI)
 *
 * The `releaseId` argument is preserved for call-site compatibility; the
 * underlying `@gigamusic/db.tokenGrantsTrack` resolves the parent release from
 * the track row itself, so the explicit hint is no longer required.
 */
export async function tokenGrantsTrack(
  token: string,
  trackId: number,
  _releaseId: number,
): Promise<boolean> {
  return queries.tokenGrantsTrack(token, trackId);
}

/**
 * Returns true if the given download token belongs to a completed order that
 * grants access to `releaseId` — either because the release was purchased, or
 * because the order contains a track whose parent release matches.
 */
export async function tokenGrantsRelease(
  token: string,
  releaseId: number,
): Promise<boolean> {
  return queries.tokenGrantsRelease(token, releaseId);
}
