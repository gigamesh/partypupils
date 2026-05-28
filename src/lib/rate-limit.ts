import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "./db";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

/**
 * Fixed-window rate limiter backed by Postgres so the limit is shared across
 * Vercel function instances. Returns `true` when the request is allowed and the
 * counter has been bumped, `false` when the caller is over the cap for the
 * current window. Older windows reset on the next call (no background sweeper).
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const { ok } = await queries.consumeRateLimit(key, { max, windowMs });
  return ok;
}

/** Pull the originating IP from request headers; falls back to a stable string. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
