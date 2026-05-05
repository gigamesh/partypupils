import { prisma } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres so the limit is shared across
 * Vercel function instances. Returns `true` when the request is allowed and the
 * counter has been bumped, `false` when the caller is over the cap for the
 * current window. Older windows reset on the next call (no background sweeper).
 *
 * The counter update is a single `INSERT ... ON CONFLICT DO UPDATE` so two
 * concurrent calls serialize on the row lock — read-then-update at Postgres'
 * default Read Committed isolation would let parallel attackers both observe
 * the same `count` and both write `count + 1`, silently bypassing the cap.
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
  const windowCutoff = new Date(now.getTime() - windowMs);

  // The CASE branches handle two paths atomically:
  //   - existing window has expired → reset count=1, windowStart=now
  //   - existing window is current → increment count, keep windowStart
  // RETURNING gives us the post-update count to compare against `max`.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "windowStart", "updatedAt")
    VALUES (${key}, 1, ${now}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limits"."windowStart" < ${windowCutoff} THEN 1
        ELSE "rate_limits"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "rate_limits"."windowStart" < ${windowCutoff} THEN ${now}
        ELSE "rate_limits"."windowStart"
      END,
      "updatedAt" = ${now}
    RETURNING "count";
  `;
  return rows[0].count <= max;
}

/** Pull the originating IP from request headers; falls back to a stable string. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
