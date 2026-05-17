/**
 * Renormalize trackNumber within each release to 1..N. Stable order:
 * (existing trackNumber asc, id asc) — so the visual order users see today
 * is preserved as much as possible while collapsing duplicates and gaps.
 *
 * Dry-run (default):
 *   npx dotenv -e .env.prod -- npx tsx scripts/renumber-release-tracks.ts
 *
 * Apply:
 *   npx dotenv -e .env.prod -- npx tsx scripts/renumber-release-tracks.ts --apply
 */
import { prisma } from "../src/lib/db";

async function main() {
  const apply = process.argv.includes("--apply");

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      name: true,
      tracks: {
        select: { id: true, name: true, trackNumber: true },
        orderBy: [{ trackNumber: "asc" }, { id: "asc" }],
      },
    },
    orderBy: { id: "asc" },
  });

  let updateCount = 0;
  let affectedReleaseCount = 0;

  for (const release of releases) {
    const plan = release.tracks
      .map((track, idx) => ({
        id: track.id,
        name: track.name,
        oldNumber: track.trackNumber,
        newNumber: idx + 1,
      }))
      .filter((p) => p.oldNumber !== p.newNumber);

    if (plan.length === 0) continue;

    affectedReleaseCount += 1;
    console.log(`\nRelease #${release.id} — ${release.name}`);
    for (const p of plan) {
      console.log(
        `  track id=${p.id}  ${p.oldNumber} → ${p.newNumber}  "${p.name}"`,
      );
    }
    updateCount += plan.length;

    if (apply) {
      await prisma.$transaction(
        plan.map((p) =>
          prisma.track.update({
            where: { id: p.id },
            data: { trackNumber: p.newNumber },
          }),
        ),
      );
    }
  }

  console.log("");
  if (apply) {
    console.log(
      `✅ Applied. Updated ${updateCount} tracks across ${affectedReleaseCount} releases.`,
    );
  } else {
    console.log(
      `Dry run. Would update ${updateCount} tracks across ${affectedReleaseCount} releases.`,
    );
    console.log("Re-run with --apply to commit.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
