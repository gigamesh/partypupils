import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { CATALOG_DISCOUNT_KEY, DEFAULT_DISCOUNT_PERCENT } from "../src/lib/constants";
import { slugify } from "../src/lib/utils";
import * as schema from "../src/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

const ARTIST = "Party Pupils";

function trackSlug(name: string): string {
  return slugify(name);
}

interface SeedRelease {
  slug: string;
  name: string;
  description?: string;
  price: number;
  type: "album" | "single";
  releasedAt: string;
  tracks: { name: string; trackNumber: number; price: number }[];
}

async function seedRelease(input: SeedRelease) {
  const existing = await db.query.releases.findFirst({
    where: eq(schema.releases.slug, input.slug),
  });
  if (existing) return;

  await db.transaction(async (tx) => {
    const [release] = await tx
      .insert(schema.releases)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        price: input.price,
        type: input.type,
        releasedAt: new Date(input.releasedAt),
        isPublished: false,
      })
      .returning({ id: schema.releases.id });

    await tx.insert(schema.tracks).values(
      input.tracks.map((t) => ({
        releaseId: release!.id,
        name: t.name,
        artist: ARTIST,
        slug: trackSlug(t.name),
        price: t.price,
        trackNumber: t.trackNumber,
      })),
    );
  });
}

async function main() {
  await seedRelease({
    name: "Virtual Clarity (Deluxe)",
    slug: "virtual-clarity-deluxe",
    description:
      "The deluxe edition of Virtual Clarity featuring 8 original tracks plus extended club mixes of each.",
    price: 999,
    type: "album",
    releasedAt: "2025-01-17",
    tracks: [
      { name: "Believe In Love", trackNumber: 1, price: 199 },
      { name: "Tokyo Blur", trackNumber: 2, price: 199 },
      { name: "Hiya", trackNumber: 3, price: 199 },
      { name: "White Light", trackNumber: 4, price: 199 },
      { name: "E.P.C.O.T.", trackNumber: 5, price: 199 },
      { name: "Are We Dreaming?", trackNumber: 6, price: 199 },
      { name: "Circuit", trackNumber: 7, price: 199 },
      { name: "Get Down", trackNumber: 8, price: 199 },
    ],
  });

  await seedRelease({
    name: "Neon From Now On",
    slug: "neon-from-now-on",
    description:
      "Party Pupils' debut EP blending house, disco, and pop with collaborations from Ashe, TOBi, Alna, and more.",
    price: 799,
    type: "album",
    releasedAt: "2020-05-15",
    tracks: [
      { name: "Lonelier (feat. Alna)", trackNumber: 1, price: 199 },
      { name: "West Coast Tears (feat. Gary Go)", trackNumber: 2, price: 199 },
      { name: "Rock The Party", trackNumber: 3, price: 199 },
      { name: "The Plug (feat. Drelli)", trackNumber: 4, price: 199 },
      { name: "Love Me For The Weekend (feat. Ashe)", trackNumber: 5, price: 199 },
      { name: "One Two Things (feat. TOBi)", trackNumber: 6, price: 199 },
      { name: "Bite My Tongue", trackNumber: 7, price: 199 },
      { name: "Sax On The Beach", trackNumber: 8, price: 199 },
    ],
  });

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
    await seedRelease({
      name: single.name,
      slug: single.slug,
      price: 199,
      type: "single",
      releasedAt: single.date,
      tracks: [{ name: single.name, trackNumber: 1, price: 199 }],
    });
  }

  const existingSetting = await db.query.siteSettings.findFirst({
    where: eq(schema.siteSettings.key, CATALOG_DISCOUNT_KEY),
  });
  if (!existingSetting) {
    await db.insert(schema.siteSettings).values({
      key: CATALOG_DISCOUNT_KEY,
      value: String(DEFAULT_DISCOUNT_PERCENT),
    });
  }

  const seedLinks = [
    {
      title: "New Single: Ride Like The Wind",
      url: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt",
      position: 0,
    },
    { title: "Spotify", url: "https://open.spotify.com/artist/4F61H4lx1js4wtWfb2Rfnt", position: 1 },
    { title: "Apple Music", url: "https://music.apple.com/us/artist/party-pupils/1158467787", position: 2 },
    { title: "SoundCloud", url: "https://soundcloud.com/partypupils", position: 3 },
    { title: "Merch Store", url: "https://party-pupils-shop.fourthwall.com", position: 4 },
  ];

  for (const link of seedLinks) {
    const existing = await db.query.links.findFirst({
      where: eq(schema.links.title, link.title),
    });
    if (!existing) {
      await db.insert(schema.links).values(link);
    }
  }

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
