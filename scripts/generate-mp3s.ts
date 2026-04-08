import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { convertToMp3 } from "../src/lib/preview";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.R2_BUCKET_NAME!;
const publicUrl = process.env.R2_PUBLIC_URL!;

async function uploadBuffer(buffer: Buffer, pathname: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: buffer,
      ContentType: "audio/mpeg",
    })
  );
  return `${publicUrl}/${pathname}`;
}

async function main() {
  const tracksWithWavOnly = await prisma.track.findMany({
    where: {
      files: {
        some: { format: "wav" },
        none: { format: "mp3" },
      },
    },
    include: {
      files: true,
      release: { select: { slug: true } },
    },
  });

  console.log(`Found ${tracksWithWavOnly.length} tracks needing MP3 generation.\n`);

  for (const track of tracksWithWavOnly) {
    const wavFile = track.files.find((f) => f.format === "wav");
    if (!wavFile) continue;

    const label = `[${track.release.slug}] Track ${track.trackNumber}: ${track.name}`;

    try {
      console.log(`${label} — downloading WAV...`);
      const res = await fetch(wavFile.storageKey);
      if (!res.ok) {
        console.error(`  ✗ Failed to download: ${res.status}`);
        continue;
      }
      const wavBuffer = Buffer.from(await res.arrayBuffer());

      console.log(`  Converting to 320kbps MP3...`);
      const mp3Buffer = await convertToMp3(wavBuffer, "320k");

      const mp3Pathname = wavFile.storageKey
        .replace(publicUrl + "/", "")
        .replace(/\.wav$/i, ".mp3");

      console.log(`  Uploading MP3...`);
      const mp3Url = await uploadBuffer(mp3Buffer, mp3Pathname);

      await prisma.trackFile.create({
        data: {
          trackId: track.id,
          format: "mp3",
          fileName: wavFile.fileName.replace(/\.wav$/i, ".mp3"),
          storageKey: mp3Url,
          fileSize: mp3Buffer.length,
        },
      });

      console.log(`  ✓ Done (${(mp3Buffer.length / 1024 / 1024).toFixed(1)} MB)\n`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err}\n`);
    }
  }

  console.log("Finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
