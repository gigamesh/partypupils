/**
 * One-time seed script to populate the storefront with GOODIES albums.
 *
 * Usage:
 *   npx tsx scripts/seed-goodies.ts --upload-blobs          # Upload files to Cloudflare R2
 *   npx tsx scripts/seed-goodies.ts --seed-local             # Seed local database
 *   npx tsx scripts/seed-goodies.ts --seed-prod              # Seed production database
 *   npx tsx scripts/seed-goodies.ts --upload-blobs --seed-local --seed-prod  # All at once
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generatePreview } from "../src/lib/preview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackManifest {
  filePath: string;
  fileName: string;
  trackName: string;
  trackNumber: number;
  format: "wav" | "mp3";
  blobUrl?: string;
  previewUrl?: string;
  fileSize?: number;
}

interface AlbumManifest {
  folderName: string;
  slug: string;
  name: string;
  coverFile: string | null;
  coverExt: string | null;
  coverImageUrl?: string;
  tracks: TrackManifest[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOODIES_DIR = path.resolve(__dirname, "../GOODIES");
const MANIFEST_PATH = path.resolve(__dirname, ".seed-manifest.json");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png"]);
const AUDIO_EXTS = new Set([".wav", ".mp3"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.pow(4, attempt - 1) * 1000;
      console.warn(`  Retry ${attempt}/${retries} for ${label} (waiting ${delay / 1000}s)...`);
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

function createR2Client(): { s3: S3Client; bucket: string; publicUrl: string } {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    console.error("Missing R2 env vars. Need: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL");
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { s3, bucket, publicUrl };
}

async function uploadToR2(
  s3: S3Client,
  bucket: string,
  publicUrl: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return `${publicUrl}/${key}`;
}

// ---------------------------------------------------------------------------
// Phase 0: Scan GOODIES directory
// ---------------------------------------------------------------------------

function scanGoodies(): AlbumManifest[] {
  const entries = fs.readdirSync(GOODIES_DIR, { withFileTypes: true });
  const albums: AlbumManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(GOODIES_DIR, entry.name);
    const files = fs.readdirSync(folderPath);

    let coverFile: string | null = null;
    let coverExt: string | null = null;
    const audioFiles: { fileName: string; filePath: string; format: "wav" | "mp3" }[] = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (AUDIO_EXTS.has(ext)) {
        audioFiles.push({
          fileName: file,
          filePath: path.join(folderPath, file),
          format: ext === ".mp3" ? "mp3" : "wav",
        });
      } else if (IMAGE_EXTS.has(ext)) {
        coverFile = path.join(folderPath, file);
        coverExt = ext.replace(".", "");
      }
    }

    audioFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

    const tracks: TrackManifest[] = audioFiles.map((af, i) => ({
      filePath: af.filePath,
      fileName: af.fileName,
      trackName: af.fileName.replace(/\.(wav|mp3)$/i, "").trim(),
      trackNumber: i + 1,
      format: af.format,
    }));

    albums.push({
      folderName: entry.name,
      slug: slugify(entry.name),
      name: entry.name,
      coverFile,
      coverExt,
      tracks,
    });
  }

  albums.sort((a, b) => a.folderName.localeCompare(b.folderName));
  return albums;
}

// ---------------------------------------------------------------------------
// Phase 1: Upload to R2
// ---------------------------------------------------------------------------

async function uploadBlobs(manifests: AlbumManifest[]): Promise<AlbumManifest[]> {
  const { s3, bucket, publicUrl } = createR2Client();
  const totalTracks = manifests.reduce((sum, a) => sum + a.tracks.length, 0);
  let completedTracks = 0;
  let failedTracks = 0;

  for (const album of manifests) {
    console.log(`\n--- ${album.name} (${album.tracks.length} tracks) ---`);

    // Upload cover image
    if (album.coverFile && !album.coverImageUrl) {
      try {
        const coverBuffer = fs.readFileSync(album.coverFile);
        const key = `images/covers/${album.slug}.${album.coverExt}`;
        const contentType = album.coverExt === "png" ? "image/png" : "image/jpeg";
        album.coverImageUrl = await withRetry(
          () => uploadToR2(s3, bucket, publicUrl, key, coverBuffer, contentType),
          `cover: ${album.name}`
        );
        console.log(`  [cover] uploaded`);
      } catch (err) {
        console.error(`  [cover] FAILED: ${err}`);
      }
    } else if (album.coverImageUrl) {
      console.log(`  [cover] already uploaded`);
    }

    // Upload tracks
    for (const track of album.tracks) {
      completedTracks++;

      if (track.blobUrl && track.previewUrl) {
        console.log(`  [${completedTracks}/${totalTracks}] "${track.trackName}" (already uploaded)`);
        continue;
      }

      try {
        const audioBuffer = fs.readFileSync(track.filePath);
        track.fileSize = audioBuffer.length;

        // Upload audio file
        const audioKey = `audio/${album.slug}/${track.trackNumber}/${track.fileName}`;
        const audioContentType = track.format === "mp3" ? "audio/mpeg" : "audio/wav";
        track.blobUrl = await withRetry(
          () => uploadToR2(s3, bucket, publicUrl, audioKey, audioBuffer, audioContentType),
          `audio: ${track.trackName}`
        );

        // Generate and upload MP3 preview
        try {
          const previewBuffer = await generatePreview(audioBuffer);
          const previewName = track.trackName + "-preview.mp3";
          const previewKey = `audio/${album.slug}/${track.trackNumber}/previews/${previewName}`;
          track.previewUrl = await withRetry(
            () => uploadToR2(s3, bucket, publicUrl, previewKey, previewBuffer, "audio/mpeg"),
            `preview: ${track.trackName}`
          );
        } catch (err) {
          console.warn(`  [${completedTracks}/${totalTracks}] preview failed for "${track.trackName}": ${err}`);
        }

        console.log(`  [${completedTracks}/${totalTracks}] "${track.trackName}" (${formatMB(track.fileSize)})`);
      } catch (err) {
        failedTracks++;
        console.error(`  [${completedTracks}/${totalTracks}] "${track.trackName}" FAILED: ${err}`);
      }

      // Save checkpoint after each track
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifests, null, 2));
    }
  }

  console.log(`\nUpload complete: ${completedTracks - failedTracks} succeeded, ${failedTracks} failed`);
  return manifests;
}

// ---------------------------------------------------------------------------
// Phase 2: Seed database
// ---------------------------------------------------------------------------

async function seedDatabase(manifests: AlbumManifest[], connectionString: string, label: string): Promise<void> {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const deleted = await prisma.release.deleteMany({});
    console.log(`  Deleted ${deleted.count} existing releases`);

    for (const album of manifests) {
      const tracksWithBlobs = album.tracks.filter((t) => t.blobUrl);
      if (tracksWithBlobs.length === 0) {
        console.warn(`  Skipping "${album.name}" -- no uploaded tracks`);
        continue;
      }

      await prisma.release.create({
        data: {
          name: album.name,
          slug: album.slug,
          price: 1500,
          type: "album",
          coverImageUrl: album.coverImageUrl ?? null,
          isPublished: true,
          tracks: {
            create: tracksWithBlobs.map((t) => ({
              name: t.trackName,
              price: 150,
              trackNumber: t.trackNumber,
              previewUrl: t.previewUrl ?? null,
              files: {
                create: [
                  {
                    format: t.format,
                    fileName: t.fileName,
                    storageKey: t.blobUrl!,
                    fileSize: t.fileSize ?? null,
                  },
                ],
              },
            })),
          },
        },
      });

      console.log(`  Created "${album.name}" with ${tracksWithBlobs.length} tracks`);
    }

    const totalReleases = await prisma.release.count();
    const totalTracks = await prisma.track.count();
    console.log(`\n  ${label}: ${totalReleases} releases, ${totalTracks} tracks`);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Manifest merge (checkpoint + fresh scan)
// ---------------------------------------------------------------------------

function mergeManifests(fresh: AlbumManifest[], saved: AlbumManifest[]): AlbumManifest[] {
  const savedBySlug = new Map(saved.map((a) => [a.slug, a]));

  for (const album of fresh) {
    const savedAlbum = savedBySlug.get(album.slug);
    if (!savedAlbum) continue;

    album.coverImageUrl = savedAlbum.coverImageUrl;
    const savedTracks = new Map(savedAlbum.tracks.map((t) => [t.trackNumber, t]));

    for (const track of album.tracks) {
      const savedTrack = savedTracks.get(track.trackNumber);
      if (!savedTrack) continue;
      track.blobUrl = savedTrack.blobUrl;
      track.previewUrl = savedTrack.previewUrl;
      track.fileSize = savedTrack.fileSize;
    }
  }

  return fresh;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldUpload = args.has("--upload-blobs");
  const shouldSeedLocal = args.has("--seed-local");
  const shouldSeedProd = args.has("--seed-prod");

  if (!shouldUpload && !shouldSeedLocal && !shouldSeedProd) {
    console.log("Usage: npx tsx scripts/seed-goodies.ts [--upload-blobs] [--seed-local] [--seed-prod]");
    process.exit(1);
  }

  let manifests = scanGoodies();
  console.log(`Scanned ${manifests.length} albums, ${manifests.reduce((s, a) => s + a.tracks.length, 0)} total tracks\n`);

  if (fs.existsSync(MANIFEST_PATH)) {
    const saved = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    manifests = mergeManifests(manifests, saved);
    console.log("Loaded checkpoint from .seed-manifest.json");
  }

  if (shouldUpload) {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
    console.log("=== Phase 1: Upload to R2 ===");
    manifests = await uploadBlobs(manifests);
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifests, null, 2));
    console.log("\nManifest saved to .seed-manifest.json");
  }

  const hasBlobs = manifests.some((a) => a.tracks.some((t) => t.blobUrl));
  if ((shouldSeedLocal || shouldSeedProd) && !hasBlobs) {
    console.error("No blob URLs found. Run --upload-blobs first.");
    process.exit(1);
  }

  if (shouldSeedLocal) {
    dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });
    console.log("\n=== Phase 2: Seed local database ===");
    await seedDatabase(manifests, process.env.DATABASE_URL!, "Local DB");
  }

  if (shouldSeedProd) {
    dotenv.config({ path: path.resolve(__dirname, "../.env.prod"), override: true });
    const ok = await confirm("About to wipe and reseed the PRODUCTION database. Continue?");
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
    console.log("\n=== Phase 3: Seed production database ===");
    await seedDatabase(manifests, process.env.DATABASE_URL!, "Prod DB");
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
