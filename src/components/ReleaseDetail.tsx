import type { ReleaseWithTracks } from "@gigamusic/db";
import { AddToCartButton } from "@/components/AddToCartButton";
import Image from "@/components/Image";
import { TrackRow } from "@/components/TrackRow";
import { toPlayerTrack } from "@/lib/player-data";

export type ReleaseForDetail = ReleaseWithTracks;

interface Props {
  release: ReleaseForDetail;
  /** Right-hand column of the top section — name, price, action buttons, etc. */
  header: React.ReactNode;
  /** If set, the matching row in the tracklist gets a neon border and becomes non-clickable. */
  highlightedTrackId?: number;
}

/**
 * Shared body for `/music/[slug]` and `/music/[slug]/[trackSlug]`. The two
 * pages render the same artwork, description, release-level cart button, and
 * tracklist — only the metadata column above the artwork differs.
 */
export function ReleaseDetail({ release, header, highlightedTrackId }: Props) {
  const releaseInfo = {
    id: release.id,
    name: release.name,
    slug: release.slug,
    coverImageUrl: release.coverImageUrl,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="glass-panel rounded-xl p-5 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:aspect-auto sm:h-40 sm:w-40">
            {release.coverImageUrl ? (
              <Image
                src={release.coverImageUrl}
                alt={release.name}
                fill
                className="object-cover"
                sizes="(min-width: 640px) 160px, 100vw"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl text-muted-foreground">
                ♪
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
            {header}
          </div>
        </div>

        {release.description && (
          <p className="text-sm text-muted-foreground">{release.description}</p>
        )}

        {release.tracks.length > 1 && (
          <AddToCartButton
            item={{
              releaseId: release.id,
              name: release.name,
              slug: release.slug,
              price: release.price,
              coverImageUrl: release.coverImageUrl,
            }}
          />
        )}

        {release.tracks.length >= 1 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Tracklist</h2>
            {release.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                release={releaseInfo}
                playerTrack={toPlayerTrack(track, releaseInfo)}
                highlighted={track.id === highlightedTrackId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
