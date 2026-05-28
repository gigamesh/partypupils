import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_BASE_URL();

  const releaseRows = await db.query.releases.findMany({
    where: eq(releases.isPublished, true),
    columns: { slug: true, updatedAt: true },
    with: {
      tracks: { columns: { slug: true } },
    },
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/music`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const releaseRoutes: MetadataRoute.Sitemap = releaseRows.map((release) => ({
    url: `${baseUrl}/music/${release.slug}`,
    lastModified: release.updatedAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const trackRoutes: MetadataRoute.Sitemap = releaseRows.flatMap((release) =>
    release.tracks.map((track) => ({
      url: `${baseUrl}/music/${release.slug}/${track.slug}`,
      lastModified: release.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  );

  return [...staticRoutes, ...releaseRoutes, ...trackRoutes];
}
