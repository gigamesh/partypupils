/**
 * One-off maintenance: rewrite every production track's stored WAV so its
 * embedded metadata + cover art match the database. Delegates to
 * `@gigamusic/audio.runRetag`, which copies the PCM audio bit-for-bit, applies
 * RIFF INFO + ID3v2 tags (no `album_artist`), and re-uploads via the storage
 * provider. MP3 retag is intentionally out of scope at the package level —
 * gigamusic re-encodes from the freshly tagged WAV on the admin upload path.
 *
 * Dry-run (default) — lists the metadata that would be written, touches nothing:
 *   npx dotenvx run -f .env.prod -- npx tsx scripts/retag-audio-files.ts
 *
 * Pilot one release first:
 *   npx dotenvx run -f .env.prod -- npx tsx scripts/retag-audio-files.ts --apply --release <slug>
 *
 * Or pilot a single track (by Track id, e.g. from the dry-run output):
 *   npx dotenvx run -f .env.prod -- npx tsx scripts/retag-audio-files.ts --apply --track <id>
 *
 * Apply to everything:
 *   npx dotenvx run -f .env.prod -- npx tsx scripts/retag-audio-files.ts --apply
 *
 * Resume after an interrupted run — skip the N oldest (already-done) releases:
 *   npx dotenvx run -f .env.prod -- npx tsx scripts/retag-audio-files.ts --apply --skip <n>
 *
 * Idempotent and re-runnable. Reads the DB only; overwrites R2 objects in place.
 */
import { runRetag, type RetagTrack } from "@gigamusic/audio";
import { createR2Provider } from "@gigamusic/storage";
import { prisma } from "../src/lib/db";
import { env } from "../src/lib/env";

async function main() {
  const apply = process.argv.includes("--apply");

  const relIdx = process.argv.indexOf("--release");
  const releaseSlug = relIdx >= 0 ? process.argv[relIdx + 1] : undefined;

  const trackIdx = process.argv.indexOf("--track");
  let trackId: number | undefined;
  if (trackIdx >= 0) {
    trackId = Number.parseInt(process.argv[trackIdx + 1] ?? "", 10);
    if (!Number.isInteger(trackId) || trackId <= 0) {
      console.error("--track requires a positive integer track id");
      process.exit(1);
    }
  }

  const skipIdx = process.argv.indexOf("--skip");
  let skipCount = 0;
  if (skipIdx >= 0) {
    skipCount = Number.parseInt(process.argv[skipIdx + 1] ?? "", 10);
    if (!Number.isInteger(skipCount) || skipCount < 0) {
      console.error("--skip requires a non-negative integer (count of oldest releases to skip)");
      process.exit(1);
    }
  }

  const storage = createR2Provider({
    accountId: env.R2_ACCOUNT_ID(),
    accessKeyId: env.R2_ACCESS_KEY_ID(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY(),
    bucket: env.R2_BUCKET_NAME(),
    publicUrl: env.R2_PUBLIC_URL(),
  });

  // Flattening the Prisma graph into RetagTrack lets us apply --release /
  // --skip / --track filtering up front, so `runRetag` sees the already-pruned
  // list. `listAllTracks` is required by the dep contract but is called once
  // with no args — we build the projection here.
  const allReleases = await prisma.release.findMany({
    where: releaseSlug ? { slug: releaseSlug } : undefined,
    include: { tracks: { orderBy: { trackNumber: "asc" }, include: { files: true } } },
    orderBy: { id: "asc" },
  });

  if (allReleases.length === 0) {
    if (releaseSlug) console.log(`No release with slug "${releaseSlug}".`);
    else console.log("No releases found.");
    return;
  }

  // Releases come back oldest-first (id asc); --skip drops the first N so an
  // interrupted run can resume without reprocessing releases already done.
  const releases = allReleases.slice(skipCount);
  if (releases.length === 0) {
    console.log(`--skip ${skipCount} skipped all ${allReleases.length} release(s) — nothing to do.`);
    return;
  }

  const allTracks: RetagTrack[] = [];
  for (const release of releases) {
    for (const track of release.tracks) {
      const wavFile = track.files.find((f) => f.format === "wav");
      const mp3File = track.files.find((f) => f.format === "mp3");
      allTracks.push({
        id: String(track.id),
        releaseId: String(release.id),
        // `runRetag` derives display artist/title internally via
        // `deriveTrackArtistTitle(name, artist)` — same helper this repo used.
        name: track.name,
        artist: track.artist ?? "",
        albumName: release.name,
        trackNumber: track.trackNumber,
        trackTotal: release.tracks.length,
        genre: track.genre ?? undefined,
        date: release.releasedAt
          ? String(release.releasedAt.getUTCFullYear())
          : undefined,
        storageKeys: {
          wav: wavFile ? storage.keyFromPublicUrl(wavFile.storageKey) : undefined,
          mp3: mp3File ? storage.keyFromPublicUrl(mp3File.storageKey) : undefined,
        },
        coverImageUrl: release.coverImageUrl ?? undefined,
      });
    }
  }

  const only =
    trackId !== undefined ? [String(trackId)] : undefined;

  const scope =
    trackId !== undefined
      ? ` (track id ${trackId})`
      : releaseSlug
        ? ` (release "${releaseSlug}")`
        : skipCount > 0
          ? ` (skipped ${skipCount} oldest)`
          : "";
  console.log(
    `${apply ? "APPLY" : "DRY RUN"} — ${releases.length} release(s), ${allTracks.length} track(s)${scope}\n`,
  );

  await runRetag(
    {
      listAllTracks: async () => allTracks,
      storage,
      logger: {
        info: (s) => console.log(s),
        warn: (s) => console.warn(s),
        error: (s) => console.error(s),
      },
    },
    { dryRun: !apply, only },
  );

  console.log("─".repeat(50));
  if (!apply) console.log("Dry run complete. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
