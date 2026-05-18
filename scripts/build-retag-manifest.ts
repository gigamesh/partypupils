/**
 * Build a JSON manifest of every track's parsed (artist, title) and the
 * existing R2 keys for its WAV and 320k MP3. Read-only — touches neither the
 * DB nor R2. The output (`scripts/.retag-manifest.json`) is meant to be
 * eyeballed and hand-corrected before `apply-retag-manifest.ts` rewrites the
 * MP3s in place.
 *
 *   pnpm tsx scripts/build-retag-manifest.ts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** Split a `"Artist - Title"` legacy track name on the first " - " (space-dash-space). */
function splitArtistTitle(name: string): { artist: string; title: string } | null {
  const idx = name.indexOf(" - ");
  if (idx < 0) return null;
  return { artist: name.slice(0, idx).trim(), title: name.slice(idx + 3).trim() };
}

/** Best-effort: extract a leading `NN - ` track number from a WAV filename. */
function trackNumberFromFilename(fileName: string): number | null {
  const m = fileName.match(/(?:^|[\s/-])(\d{1,3})\s*-\s*/);
  return m ? parseInt(m[1], 10) : null;
}

interface ManifestEntry {
  trackId: number;
  releaseId: number;
  releaseSlug: string;
  releaseName: string;
  releaseYear: number | null;
  trackNumber: number;
  trackTotal: number;
  currentTrackName: string;
  currentArtist: string | null;
  wavFileName: string | null;
  wavStorageKey: string | null;
  mp3StorageKey: string | null;
  parsed: { artist: string; title: string };
  source: "track-artist-column" | "track-name-split" | "fallback-title-only";
  needsReview: boolean;
  reviewReasons: string[];
}

async function main() {
  const releases = await prisma.release.findMany({
    include: {
      tracks: {
        orderBy: { trackNumber: "asc" },
        include: { files: true },
      },
    },
  });

  const entries: ManifestEntry[] = [];

  for (const release of releases) {
    const trackTotal = release.tracks.length;
    const releaseYear = release.releasedAt
      ? new Date(release.releasedAt).getUTCFullYear()
      : null;

    for (const track of release.tracks) {
      const wavFile = track.files.find((f) => f.format === "wav");
      const mp3File = track.files.find((f) => f.format === "mp3");

      const reviewReasons: string[] = [];

      // 1. Already-stored artist wins (lets re-runs preserve hand-corrections).
      // 2. Otherwise split track.name on " - ".
      // 3. Otherwise the whole name becomes the title and artist is empty — flag for review.
      let parsed: { artist: string; title: string };
      let source: ManifestEntry["source"];
      if (track.artist) {
        const prefix = `${track.artist} - `;
        parsed = {
          artist: track.artist,
          title: track.name.startsWith(prefix) ? track.name.slice(prefix.length) : track.name,
        };
        source = "track-artist-column";
      } else {
        const split = splitArtistTitle(track.name);
        if (split) {
          parsed = split;
          source = "track-name-split";
        } else {
          parsed = { artist: "", title: track.name };
          source = "fallback-title-only";
          reviewReasons.push("No ' - ' separator in track name — artist could not be inferred.");
        }
      }

      if (!parsed.title) reviewReasons.push("Parsed title is empty.");

      if (wavFile) {
        const fileTrackNum = trackNumberFromFilename(wavFile.fileName);
        if (fileTrackNum != null && fileTrackNum !== track.trackNumber) {
          reviewReasons.push(
            `Track number in filename (${fileTrackNum}) doesn't match Track.trackNumber (${track.trackNumber}).`,
          );
        }
      } else {
        reviewReasons.push("No WAV file on record — can't re-encode.");
      }

      if (!mp3File) reviewReasons.push("No MP3 TrackFile row — backfill would have to create one.");

      entries.push({
        trackId: track.id,
        releaseId: release.id,
        releaseSlug: release.slug,
        releaseName: release.name,
        releaseYear,
        trackNumber: track.trackNumber,
        trackTotal,
        currentTrackName: track.name,
        currentArtist: track.artist,
        wavFileName: wavFile?.fileName ?? null,
        wavStorageKey: wavFile?.storageKey ?? null,
        mp3StorageKey: mp3File?.storageKey ?? null,
        parsed,
        source,
        needsReview: reviewReasons.length > 0,
        reviewReasons,
      });
    }
  }

  const outPath = resolve(__dirname, ".retag-manifest.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");

  const flagged = entries.filter((e) => e.needsReview).length;
  console.log(`Wrote ${entries.length} entries → ${outPath}`);
  console.log(`  ${entries.length - flagged} clean, ${flagged} flagged for review`);
  if (flagged > 0) {
    console.log("\nFlagged entries (fix in JSON before running apply-retag-manifest):\n");
    for (const e of entries.filter((x) => x.needsReview)) {
      console.log(`  [${e.releaseSlug} #${e.trackNumber}] ${e.currentTrackName}`);
      for (const r of e.reviewReasons) console.log(`    - ${r}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
