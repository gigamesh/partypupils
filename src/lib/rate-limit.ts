import { prisma } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres so the limit is shared across
 * Vercel function instances. Returns `true` when the request is allowed and the
 * counter has been bumped, `false` when the caller is over the cap for the
 * current window. Older windows reset on the next call (no background sweeper).
 *
 * For most pages a 15-minute window with single-digit `max` is plenty; this is
 * not a precise sliding window — bursts at the boundary can roughly double the
 * effective rate, which is fine for abuse control rather than fairness.
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimit.findUnique({ where: { key } });
    const expired =
      !existing || now.getTime() - existing.windowStart.getTime() >= windowMs;

    if (expired) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return true;
    }

    if (existing.count >= max) return false;

    await tx.rateLimit.update({
      where: { key },
      data: { count: existing.count + 1 },
    });
    return true;
  });
}

/** Pull the originating IP from request headers; falls back to a stable string. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
