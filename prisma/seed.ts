import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.product.upsert({
    where: { slug: "love-me-again" },
    update: {},
    create: {
      name: "Love Me Again",
      slug: "love-me-again",
      description: "A high-energy dance track with infectious vocal chops and a driving bassline.",
      price: 199,
      type: "track",
      coverImageUrl: null,
      releasedAt: new Date("2024-06-15"),
      isPublished: true,
      files: {
        create: [
          { format: "mp3", fileName: "Love Me Again.mp3", storageKey: "audio/love-me-again/mp3/love-me-again.mp3", fileSize: 8500000 },
          { format: "wav", fileName: "Love Me Again.wav", storageKey: "audio/love-me-again/wav/love-me-again.wav", fileSize: 42000000 },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "come-alive-ep" },
    update: {},
    create: {
      name: "Come Alive EP",
      slug: "come-alive-ep",
      description: "A four-track EP blending future bass, house, and pop sensibilities.",
      price: 599,
      type: "release",
      coverImageUrl: null,
      releasedAt: new Date("2024-09-01"),
      isPublished: true,
      files: {
        create: [
          { format: "mp3", fileName: "Come Alive EP.zip", storageKey: "audio/come-alive-ep/mp3/come-alive-ep.zip", fileSize: 32000000 },
          { format: "wav", fileName: "Come Alive EP.zip", storageKey: "audio/come-alive-ep/wav/come-alive-ep.zip", fileSize: 160000000 },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "sunset-drive" },
    update: {},
    create: {
      name: "Sunset Drive",
      slug: "sunset-drive",
      description: "Smooth summer vibes with lush synths and a groovy rhythm section.",
      price: 199,
      type: "track",
      coverImageUrl: null,
      releasedAt: new Date("2025-01-20"),
      isPublished: true,
      files: {
        create: [
          { format: "mp3", fileName: "Sunset Drive.mp3", storageKey: "audio/sunset-drive/mp3/sunset-drive.mp3", fileSize: 9200000 },
          { format: "wav", fileName: "Sunset Drive.wav", storageKey: "audio/sunset-drive/wav/sunset-drive.wav", fileSize: 45000000 },
        ],
      },
    },
  });

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
