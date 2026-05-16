/**
 * One-shot DB migration + backfill for `Track.slug`.
 *
 * Run BEFORE `prisma db push` (which is invoked automatically by `pnpm dev`),
 * otherwise db push will try to add the non-null column to a populated table
 * and fail.
 *
 * Idempotent: safe to re-run. Uses raw SQL so it works even when the generated
 * Prisma client doesn't yet know about the `slug` column.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { slugify } from "../src/lib/utils";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Fresh DBs (e.g. first-time `pnpm dev` clones) don't have the `tracks` table yet.
  // In that case there's nothing to backfill — `prisma db push` later in the pipeline
  // will create the table with `slug NOT NULL` from scratch.
  const tableExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('public.tracks') IS NOT NULL AS exists`,
  );
  if (!tableExists[0]?.exists) {
    console.log("tracks table does not exist yet — nothing to backfill.");
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "slug" TEXT`,
  );

  const rows = await prisma.$queryRawUnsafe<
    { id: number; releaseId: number; name: string; trackNumber: number; slug: string | null }[]
  >(
    `SELECT id, "releaseId", name, "trackNumber", slug FROM "tracks" ORDER BY "releaseId" ASC, "trackNumber" ASC`,
  );

  const usedByRelease = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.slug == null) continue;
    if (!usedByRelease.has(r.releaseId)) usedByRelease.set(r.releaseId, new Set());
    usedByRelease.get(r.releaseId)!.add(r.slug);
  }

  let updated = 0;
  for (const r of rows) {
    if (r.slug != null) continue;

    const base = slugify(r.name) || `track-${r.trackNumber}`;
    const taken = usedByRelease.get(r.releaseId) ?? new Set<string>();

    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;

    await prisma.$executeRawUnsafe(
      `UPDATE "tracks" SET slug = $1 WHERE id = $2`,
      candidate,
      r.id,
    );
    taken.add(candidate);
    usedByRelease.set(r.releaseId, taken);
    updated++;
    console.log(`  ✓ track ${r.id} (release ${r.releaseId}): "${r.name}" → ${candidate}`);
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "tracks" ALTER COLUMN "slug" SET NOT NULL`,
  );

  console.log(`\nFinished. Backfilled ${updated} slug(s). Column is now NOT NULL.`);
  console.log(`Next: pnpm dev (or prisma db push) — it will add the unique index.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
