import { CatalogBanner } from "@/components/CatalogBanner";
import { ReleaseCard } from "@/components/ReleaseCard";
import { getCatalogPrice } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Music",
  description: "Music by Party Pupils.",
};

export default async function MusicPage() {
  const [releases, catalog] = await Promise.all([
    prisma.release.findMany({
      where: { isPublished: true },
      orderBy: { releasedAt: "desc" },
    }),
    getCatalogPrice(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="neon-glow uppercase">Music</h1>

      {catalog.releaseCount > 1 && <CatalogBanner catalog={catalog} />}

      {releases.length === 0 ? (
        <p className="text-muted-foreground">
          No music available yet. Check back soon!
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              name={release.name}
              slug={release.slug}
              price={release.price}
              type={release.type}
              coverImageUrl={release.coverImageUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
