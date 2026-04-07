import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Virtual Clarity (Deluxe) — Album, January 17, 2025
  await prisma.release.upsert({
    where: { slug: "virtual-clarity-deluxe" },
    update: {},
    create: {
      name: "Virtual Clarity (Deluxe)",
      slug: "virtual-clarity-deluxe",
      description: "The deluxe edition of Virtual Clarity featuring 8 original tracks plus extended club mixes of each.",
      price: 999,
      type: "album",
      releasedAt: new Date("2025-01-17"),
      isPublished: true,
      tracks: {
        create: [
          { name: "Believe In Love", price: 199, trackNumber: 1 },
          { name: "Tokyo Blur", price: 199, trackNumber: 2 },
          { name: "Hiya", price: 199, trackNumber: 3 },
          { name: "White Light", price: 199, trackNumber: 4 },
          { name: "E.P.C.O.T.", price: 199, trackNumber: 5 },
          { name: "Are We Dreaming?", price: 199, trackNumber: 6 },
          { name: "Circuit", price: 199, trackNumber: 7 },
          { name: "Get Down", price: 199, trackNumber: 8 },
        ],
      },
    },
  });

  // Neon From Now On — Album, May 15, 2020
  await prisma.release.upsert({
    where: { slug: "neon-from-now-on" },
    update: {},
    create: {
      name: "Neon From Now On",
      slug: "neon-from-now-on",
      description: "Party Pupils' debut EP blending house, disco, and pop with collaborations from Ashe, TOBi, Alna, and more.",
      price: 799,
      type: "album",
      releasedAt: new Date("2020-05-15"),
      isPublished: true,
      tracks: {
        create: [
          { name: "Lonelier (feat. Alna)", price: 199, trackNumber: 1 },
          { name: "West Coast Tears (feat. Gary Go)", price: 199, trackNumber: 2 },
          { name: "Rock The Party", price: 199, trackNumber: 3 },
          { name: "The Plug (feat. Drelli)", price: 199, trackNumber: 4 },
          { name: "Love Me For The Weekend (feat. Ashe)", price: 199, trackNumber: 5 },
          { name: "One Two Things (feat. TOBi)", price: 199, trackNumber: 6 },
          { name: "Bite My Tongue", price: 199, trackNumber: 7 },
          { name: "Sax On The Beach", price: 199, trackNumber: 8 },
        ],
      },
    },
  });

  // Recent singles
  const singles: { name: string; slug: string; date: string }[] = [
    { name: "Ride Like The Wind (Yacht House Mix)", slug: "ride-like-the-wind", date: "2026-03-06" },
    { name: "Never Too Much", slug: "never-too-much", date: "2025-09-01" },
    { name: "Little Lies", slug: "little-lies", date: "2025-07-01" },
    { name: "Here We Are", slug: "here-we-are", date: "2025-05-01" },
    { name: "Missin My Window", slug: "missin-my-window", date: "2025-03-01" },
    { name: "Touch", slug: "touch", date: "2025-02-01" },
    { name: "Dance with You", slug: "dance-with-you", date: "2024-06-01" },
  ];

  for (const single of singles) {
    await prisma.release.upsert({
      where: { slug: single.slug },
      update: {},
      create: {
        name: single.name,
        slug: single.slug,
        price: 199,
        type: "single",
        releasedAt: new Date(single.date),
        isPublished: true,
        tracks: {
          create: [
            { name: single.name, price: 199, trackNumber: 1 },
          ],
        },
      },
    });
  }

  // Site settings
  await prisma.siteSetting.upsert({
    where: { key: "catalog_discount_percent" },
    update: {},
    create: { key: "catalog_discount_percent", value: "15" },
  });

  // Links
  const seedLinks = [
    { title: "New Single: Ride Like The Wind", url: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt", position: 0 },
    { title: "Spotify", url: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt", position: 1 },
    { title: "Apple Music", url: "https://music.apple.com/us/artist/party-pupils/1158467787", position: 2 },
    { title: "SoundCloud", url: "https://soundcloud.com/partypupils", position: 3 },
    { title: "Merch Store", url: "https://partypupils.threadless.com/designs/party-pupils", position: 4 },
  ];

  for (const link of seedLinks) {
    const existing = await prisma.link.findFirst({ where: { title: link.title } });
    if (!existing) {
      await prisma.link.create({ data: link });
    }
  }

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
