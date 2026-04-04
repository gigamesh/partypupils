import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.release.upsert({
    where: { slug: "come-alive" },
    update: {},
    create: {
      name: "Come Alive",
      slug: "come-alive",
      description: "A four-track album blending future bass, house, and pop sensibilities.",
      price: 599,
      type: "album",
      releasedAt: new Date("2024-09-01"),
      isPublished: true,
      tracks: {
        create: [
          {
            name: "Come Alive",
            price: 199,
            trackNumber: 1,
            files: {
              create: [
                { format: "mp3", fileName: "Come Alive.mp3", storageKey: "audio/come-alive/01/come-alive.mp3", fileSize: 8500000 },
                { format: "wav", fileName: "Come Alive.wav", storageKey: "audio/come-alive/01/come-alive.wav", fileSize: 42000000 },
              ],
            },
          },
          {
            name: "Love Me Again",
            price: 199,
            trackNumber: 2,
            files: {
              create: [
                { format: "mp3", fileName: "Love Me Again.mp3", storageKey: "audio/come-alive/02/love-me-again.mp3", fileSize: 8200000 },
                { format: "wav", fileName: "Love Me Again.wav", storageKey: "audio/come-alive/02/love-me-again.wav", fileSize: 40000000 },
              ],
            },
          },
          {
            name: "Sunset Drive",
            price: 199,
            trackNumber: 3,
            files: {
              create: [
                { format: "mp3", fileName: "Sunset Drive.mp3", storageKey: "audio/come-alive/03/sunset-drive.mp3", fileSize: 9200000 },
                { format: "wav", fileName: "Sunset Drive.wav", storageKey: "audio/come-alive/03/sunset-drive.wav", fileSize: 45000000 },
              ],
            },
          },
          {
            name: "Night Shift",
            price: 199,
            trackNumber: 4,
            files: {
              create: [
                { format: "mp3", fileName: "Night Shift.mp3", storageKey: "audio/come-alive/04/night-shift.mp3", fileSize: 7800000 },
                { format: "wav", fileName: "Night Shift.wav", storageKey: "audio/come-alive/04/night-shift.wav", fileSize: 38000000 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.release.upsert({
    where: { slug: "neon-lights" },
    update: {},
    create: {
      name: "Neon Lights",
      slug: "neon-lights",
      description: "A high-energy single with infectious vocal chops and a driving bassline.",
      price: 199,
      type: "single",
      releasedAt: new Date("2025-01-20"),
      isPublished: true,
      tracks: {
        create: [
          {
            name: "Neon Lights",
            price: 199,
            trackNumber: 1,
            files: {
              create: [
                { format: "mp3", fileName: "Neon Lights.mp3", storageKey: "audio/neon-lights/01/neon-lights.mp3", fileSize: 9200000 },
                { format: "wav", fileName: "Neon Lights.wav", storageKey: "audio/neon-lights/01/neon-lights.wav", fileSize: 45000000 },
              ],
            },
          },
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
