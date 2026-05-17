import { CatalogBanner } from "@/components/CatalogBanner";
import { PartyPupilsRadioButton } from "@/components/PartyPupilsRadioButton";
import { ReleaseCard } from "@/components/ReleaseCard";
import { Button } from "@/components/ui/button";
import { getCatalogPrice } from "@/lib/catalog";
import { buildPlayerTracksForRelease } from "@/lib/player-data";
import { getPublishedReleases } from "@/lib/release-reads";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music",
  description: "Music by Party Pupils.",
};

export default async function MusicPage() {
  const [releases, catalog] = await Promise.all([
    getPublishedReleases(),
    getCatalogPrice(),
  ]);

  const releasesWithTracks = releases.map((r) => ({
    ...r,
    playerTracks: buildPlayerTracksForRelease(r),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="neon-glow uppercase mb-0">Music</h1>
        <div className="flex items-center gap-2">
          <Button href="/faq" variant="secondary">
            FAQ
          </Button>
          <PartyPupilsRadioButton />
        </div>
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
