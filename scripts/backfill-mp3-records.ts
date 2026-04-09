import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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

  console.log(`Found ${tracksWithWavOnly.length} tracks needing MP3 records.\n`);

  let created = 0;
  let skipped = 0;

  for (const track of tracksWithWavOnly) {
    const wavFile = track.files.find((f) => f.format === "wav");
    if (!wavFile) continue;

    const mp3Url = wavFile.storageKey.replace(/\.wav$/i, ".mp3");
    const mp3FileName = wavFile.fileName.replace(/\.wav$/i, ".mp3");
    const label = `[${track.release.slug}] ${track.name}`;

    try {
      const res = await fetch(mp3Url, { method: "HEAD" });
      if (!res.ok) {
        console.log(`  ✗ ${label} — MP3 not found at ${mp3Url} (${res.status})`);
        skipped++;
        continue;
      }

      const fileSize = parseInt(res.headers.get("content-length") || "0");

      await prisma.trackFile.create({
        data: {
          trackId: track.id,
          format: "mp3",
          fileName: mp3FileName,
          storageKey: mp3Url,
          fileSize,
        },
      });

      console.log(`  ✓ ${label} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${label} — ${err}`);
      skipped++;
    }
  }

  console.log(`\nFinished. Created: ${created}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
