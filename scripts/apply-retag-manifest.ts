/**
 * Apply a reviewed `scripts/.retag-manifest.json` by:
 *   1. fetching each WAV from R2
 *   2. re-encoding it to 320k MP3 with the parsed Artist / Title / Album /
 *      Track NN/Total / Year embedded as ID3v2.3 tags
 *   3. uploading back to the existing MP3 storage key (overwrite in place)
 *   4. populating Track.artist in the DB
 *
 * Refuses to run if any manifest entry still has `needsReview: true`. Re-runs
 * are idempotent — the same WAV produces the same tagged MP3 written to the
 * same key.
 *
 *   pnpm tsx scripts/apply-retag-manifest.ts          # dry-run, no writes
 *   pnpm tsx scripts/apply-retag-manifest.ts --execute
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Readable } from "stream";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { convertWavStreamToMp3 } from "../src/lib/preview";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const bucket = process.env.R2_BUCKET_NAME!;
const publicUrl = process.env.R2_PUBLIC_URL!;

/** Strip the public-URL prefix to get a bucket-relative R2 key. */
function keyFromStorageUrl(storageUrl: string): string {
  return storageUrl.replace(`${publicUrl}/`, "");
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
  source: string;
  needsReview: boolean;
  reviewReasons: string[];
}

async function main() {
  const execute = process.argv.includes("--execute");
  const manifestPath = resolve(__dirname, ".retag-manifest.json");
  const entries: ManifestEntry[] = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const flagged = entries.filter((e) => e.needsReview);
  if (flagged.length > 0) {
    console.error(`Refusing to run: ${flagged.length} entries still have needsReview=true.`);
    for (const e of flagged) {
      console.error(`  [${e.releaseSlug} #${e.trackNumber}] ${e.currentTrackName}`);
    }
    process.exit(1);
  }

  const skippable = entries.filter((e) => !e.wavStorageKey || !e.mp3StorageKey);
  if (skippable.length > 0) {
    console.warn(`Skipping ${skippable.length} entries missing wav/mp3 storage keys.`);
  }

  const work = entries.filter((e) => e.wavStorageKey && e.mp3StorageKey);
  console.log(`${execute ? "EXECUTING" : "DRY RUN"} retag for ${work.length} tracks.\n`);

  let succeeded = 0;
  let failed = 0;

  for (const entry of work) {
    const label = `[${entry.releaseSlug} #${entry.trackNumber}] ${entry.parsed.artist} - ${entry.parsed.title}`;

    try {
      if (!execute) {
        console.log(`  · ${label}  (would re-encode & write to ${entry.mp3StorageKey})`);
        continue;
      }

      const wavKey = keyFromStorageUrl(entry.wavStorageKey!);
      const mp3Key = keyFromStorageUrl(entry.mp3StorageKey!);

      console.log(`  → ${label}`);
      console.log(`      GET   ${wavKey}`);
      const wavObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: wavKey }));
      const wavStream = wavObj.Body as Readable;

      const mp3Buffer = await streamToBuffer(
        convertWavStreamToMp3(wavStream, "320k", {
          title: entry.parsed.title,
          artist: entry.parsed.artist || undefined,
          album: entry.releaseName,
          trackNumber: entry.trackNumber,
          trackTotal: entry.trackTotal,
          year: entry.releaseYear ?? undefined,
        }),
      );

      console.log(`      PUT   ${mp3Key}  (${(mp3Buffer.length / 1024 / 1024).toFixed(1)} MB)`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: mp3Key,
          Body: mp3Buffer,
          ContentType: "audio/mpeg",
        }),
      );

      await prisma.track.update({
        where: { id: entry.trackId },
        data: {
          artist: entry.parsed.artist || null,
          // Re-derive the legacy display name from the parsed split so it
          // stays consistent with the tag (and with download filenames).
          name: entry.parsed.artist ? `${entry.parsed.artist} - ${entry.parsed.title}` : entry.parsed.title,
        },
      });

      succeeded++;
    } catch (err) {
      failed++;
      console.error(`      ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nDone. ${execute ? `${succeeded} succeeded, ${failed} failed` : `${work.length} would be processed (re-run with --execute)`}.`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
