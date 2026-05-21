/**
 * One-off maintenance: rewrite every production track's stored WAV + MP3 so their
 * embedded metadata + cover art match the database. The MP3 is regenerated through
 * the same `convertWavStreamToMp3` path the admin upload uses; the WAV is retagged
 * losslessly (audio copied bit-for-bit) and given the MP3's own ID3v2 tag.
 *
 * Dry-run (default) — lists the metadata that would be written, touches nothing:
 *   npx dotenv -e .env.prod -- npx tsx scripts/retag-audio-files.ts
 *
 * Pilot one release first:
 *   npx dotenv -e .env.prod -- npx tsx scripts/retag-audio-files.ts --apply --release <slug>
 *
 * Or pilot a single track (by Track id, e.g. from the dry-run output):
 *   npx dotenv -e .env.prod -- npx tsx scripts/retag-audio-files.ts --apply --track <id>
 *
 * Apply to everything:
 *   npx dotenv -e .env.prod -- npx tsx scripts/retag-audio-files.ts --apply
 *
 * Idempotent and re-runnable. Reads the DB only; overwrites R2 objects in place.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { parseFile } from "music-metadata";
import { prisma } from "../src/lib/db";
import { convertWavStreamToMp3, type Mp3Metadata } from "../src/lib/preview";
import { extractId3v2Tag, retagWav } from "../src/lib/wav-tags";
import {
  getFileBuffer,
  getFileStream,
  keyFromPublicUrl,
  uploadStream,
} from "../src/lib/storage";
import { deriveTrackArtistTitle } from "../src/lib/track-name";

async function downloadToFile(key: string, dest: string): Promise<void> {
  const stream = await getFileStream(key);
  await pipeline(stream, createWriteStream(dest));
}

function describe(meta: Mp3Metadata): string {
  const track =
    meta.trackNumber != null
      ? `${meta.trackNumber}${meta.trackTotal != null ? "/" + meta.trackTotal : ""}`
      : "-";
  return (
    `artist=${JSON.stringify(meta.artist ?? "")} title=${JSON.stringify(meta.title ?? "")} ` +
    `album=${JSON.stringify(meta.album ?? "")} genre=${JSON.stringify(meta.genre ?? "")} ` +
    `track=${track} year=${meta.year ?? "-"}`
  );
}

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

  const releases = await prisma.release.findMany({
    where:
      trackId !== undefined
        ? { tracks: { some: { id: trackId } } }
        : releaseSlug
          ? { slug: releaseSlug }
          : undefined,
    include: { tracks: { orderBy: { trackNumber: "asc" }, include: { files: true } } },
    orderBy: { id: "asc" },
  });

  if (releases.length === 0) {
    if (trackId !== undefined) console.log(`No track with id ${trackId}.`);
    else if (releaseSlug) console.log(`No release with slug "${releaseSlug}".`);
    else console.log("No releases found.");
    return;
  }

  const scope =
    trackId !== undefined
      ? ` (track id ${trackId})`
      : releaseSlug
        ? ` (release "${releaseSlug}")`
        : "";
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${releases.length} release(s)${scope}\n`);

  let ok = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const release of releases) {
    console.log(`Release #${release.id} — ${release.name}  (${release.tracks.length} tracks)`);

    for (const track of release.tracks) {
      if (trackId !== undefined && track.id !== trackId) continue;
      const { artist, title } = deriveTrackArtistTitle(track.name, track.artist);
      // Trim every embedded value — DB names carry stray whitespace (e.g. the
      // "Yacht House Summer - Vol 1 " release name); tags shouldn't.
      const metadata: Mp3Metadata = {
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        album: release.name.trim() || undefined,
        genre: track.genre?.trim() || undefined,
        trackNumber: track.trackNumber,
        trackTotal: release.tracks.length,
        year: release.releasedAt ? release.releasedAt.getUTCFullYear() : undefined,
      };

      const wavFile = track.files.find((f) => f.format === "wav");
      const mp3File = track.files.find((f) => f.format === "mp3");
      const label = `  track #${track.trackNumber} (id ${track.id})`;

      if (!wavFile) {
        console.log(`${label}  ⚠ no WAV file on record — skipped`);
        skipped++;
        continue;
      }

      if (!apply) {
        console.log(
          `${label}  ${describe(metadata)}  [releaseCover=${release.coverImageUrl ? "yes" : "no"}]`,
        );
        continue;
      }

      const id = randomUUID();
      const tmp = {
        wav: join(tmpdir(), `${id}.wav`),
        art: join(tmpdir(), `${id}.art`),
        mp3: join(tmpdir(), `${id}.mp3`),
        outWav: join(tmpdir(), `${id}.out.wav`),
      };

      try {
        await downloadToFile(keyFromPublicUrl(wavFile.storageKey), tmp.wav);
        const srcInfo = await parseFile(tmp.wav);

        // Artwork: the WAV's own embedded picture wins; otherwise the release cover.
        let coverPath: string | undefined;
        const wavPic = srcInfo.common.picture?.[0];
        if (wavPic) {
          await writeFile(tmp.art, Buffer.from(wavPic.data));
          coverPath = tmp.art;
        } else if (release.coverImageUrl) {
          await writeFile(tmp.art, await getFileBuffer(keyFromPublicUrl(release.coverImageUrl)));
          coverPath = tmp.art;
        }

        // MP3 via the upload code path; its ID3v2 tag is then reused for the WAV.
        await convertWavStreamToMp3({
          wavStream: createReadStream(tmp.wav),
          mp3Path: tmp.mp3,
          bitrate: "320k",
          metadata,
          coverPath,
        });
        const id3v2Tag = extractId3v2Tag(await readFile(tmp.mp3));
        if (!id3v2Tag) throw new Error("generated MP3 has no ID3v2 tag");

        await retagWav({ srcWavPath: tmp.wav, outWavPath: tmp.outWav, metadata, id3v2Tag });

        // Integrity check before overwriting anything in storage.
        const outInfo = await parseFile(tmp.outWav);
        const srcDur = srcInfo.format.duration ?? 0;
        const outDur = outInfo.format.duration ?? 0;
        if (Math.abs(srcDur - outDur) > 0.05) {
          throw new Error(
            `retagged WAV duration drift ${srcDur.toFixed(3)}s → ${outDur.toFixed(3)}s`,
          );
        }
        if (metadata.title && outInfo.common.title !== metadata.title) {
          throw new Error("retagged WAV title not applied");
        }

        if (mp3File) {
          await uploadStream(
            createReadStream(tmp.mp3),
            keyFromPublicUrl(mp3File.storageKey),
            "audio/mpeg",
          );
        }
        await uploadStream(
          createReadStream(tmp.outWav),
          keyFromPublicUrl(wavFile.storageKey),
          "audio/wav",
        );

        console.log(
          `${label}  ✓ retagged WAV${mp3File ? " + MP3" : " (no MP3 on record)"}` +
            `${coverPath ? "" : " (no artwork)"}  — ${describe(metadata)}`,
        );
        ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${label}  ✗ FAILED — ${msg}`);
        failures.push(`track ${track.id} (${release.name} #${track.trackNumber}): ${msg}`);
      } finally {
        await Promise.allSettled([
          unlink(tmp.wav),
          unlink(tmp.art),
          unlink(tmp.mp3),
          unlink(tmp.outWav),
        ]);
      }
    }
    console.log("");
  }

  console.log("─".repeat(50));
  if (apply) {
    console.log(`Done. ${ok} retagged, ${skipped} skipped, ${failures.length} failed.`);
    if (failures.length) {
      console.log("\nFailures:");
      for (const f of failures) console.log(`  - ${f}`);
    }
  } else {
    console.log("Dry run complete. Re-run with --apply to write.");
  }
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
