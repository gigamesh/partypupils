/**
 * Direct tests for `queries.consumeRateLimit`. The contact + admin-auth route
 * tests already cover serial-call behaviour; this file pins down the
 * concurrency contract — `INSERT ... ON CONFLICT DO UPDATE` must serialize
 * parallel callers so the limit is honoured exactly even under burst load.
 * The old read-then-update pattern would let parallel callers both observe
 * the same `count` and both write `count + 1`, silently exceeding the cap.
 *
 * Parallelism numbers are kept modest because Prisma's local dev Postgres
 * tolerates only a handful of concurrent writes on the same row; the
 * atomicity property holds regardless of count, so 5 contenders is enough
 * to exercise it.
 */
import { describe, it, expect } from "vitest";
import { prisma, queries } from "@/lib/db";

const consume = (key: string, max: number, windowMs: number) =>
  queries.consumeRateLimit(key, { max, windowMs }).then((r) => r.ok);

describe("consumeRateLimit", () => {
  it("honours the cap exactly under concurrent calls on the same key", async () => {
    const max = 2;
    const parallel = 5;

    const results = await Promise.all(
      Array.from({ length: parallel }, () => consume("burst:single-key", max, 60_000)),
    );

    const allowed = results.filter((r) => r === true).length;
    const denied = results.filter((r) => r === false).length;

    // Exactly `max` allowed; everyone else gets denied. With the old
    // read-then-update pattern this would intermittently exceed `max`.
    expect(allowed).toBe(max);
    expect(denied).toBe(parallel - max);

    const row = await prisma.rateLimit.findUnique({ where: { key: "burst:single-key" } });
    // The counter keeps climbing past `max` (we still bump it on rejected calls);
    // the contract is "<=max returns true," not "stop counting at max."
    expect(row?.count).toBe(parallel);
  });

  it("isolates parallel callers on different keys", async () => {
    const max = 1;

    const results = await Promise.all([
      ...Array.from({ length: 2 }, () => consume("burst:a", max, 60_000)),
      ...Array.from({ length: 2 }, () => consume("burst:b", max, 60_000)),
    ]);

    const aResults = results.slice(0, 2);
    const bResults = results.slice(2);
    expect(aResults.filter((r) => r).length).toBe(max);
    expect(bResults.filter((r) => r).length).toBe(max);
  });

  it("resets the counter when the window has expired", async () => {
    // Saturate the limit, then manually age the row so the next call sees an expired window.
    expect(await consume("expiry", 2, 60_000)).toBe(true);
    expect(await consume("expiry", 2, 60_000)).toBe(true);
    expect(await consume("expiry", 2, 60_000)).toBe(false);

    await prisma.rateLimit.update({
      where: { key: "expiry" },
      data: { windowStart: new Date(Date.now() - 120_000) }, // 2 minutes ago
    });

    expect(await consume("expiry", 2, 60_000)).toBe(true);

    const row = await prisma.rateLimit.findUnique({ where: { key: "expiry" } });
    expect(row?.count).toBe(1);
  });

  it("creates the row on the first call", async () => {
    const before = await prisma.rateLimit.findUnique({ where: { key: "first" } });
    expect(before).toBeNull();

    expect(await consume("first", 3, 60_000)).toBe(true);

    const after = await prisma.rateLimit.findUnique({ where: { key: "first" } });
    expect(after?.count).toBe(1);
  });
});
