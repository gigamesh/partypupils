import { CatalogBanner } from "@/components/CatalogBanner";
import { PartyPupilsRadioButton } from "@/components/PartyPupilsRadioButton";
import { ReleaseCard } from "@/components/ReleaseCard";
import { getCatalogPrice } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { toPlayerTrack } from "@/lib/player-data";
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
      include: {
        tracks: {
          orderBy: { trackNumber: "asc" },
          include: { files: true },
        },
      },
    }),
    getCatalogPrice(),
  ]);

  const releasesWithTracks = releases.map((r) => {
    const releaseInfo = {
      id: r.id,
      name: r.name,
      slug: r.slug,
      coverImageUrl: r.coverImageUrl,
    };
    const tracks = r.tracks
      .map((t) => toPlayerTrack(t, releaseInfo))
      .filter((t): t is NonNullable<typeof t> => t !== null);
    return { ...r, playerTracks: tracks };
  });

  const hasAnyStreamableTrack = releasesWithTracks.some((r) => r.playerTracks.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="neon-glow uppercase mb-0">Music</h1>
        {hasAnyStreamableTrack && <PartyPupilsRadioButton />}
      </div>

      {catalog.releaseCount > 1 && <CatalogBanner catalog={catalog} />}

      {releases.length === 0 ? (
        <p className="text-muted-foreground">
          No music available yet. Check back soon!
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {releasesWithTracks.map((release) => (
            <ReleaseCard
              key={release.id}
              id={release.id}
              name={release.name}
              slug={release.slug}
              price={release.price}
              type={release.type}
              coverImageUrl={release.coverImageUrl}
              tracks={release.playerTracks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
