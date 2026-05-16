import type { Prisma } from "@/generated/prisma/client";
import { AddToCartButton } from "@/components/AddToCartButton";
import Image from "@/components/Image";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { TracklistRowLink } from "@/components/TracklistRowLink";
import { buildPlayerTracksForRelease, toPlayerTrack } from "@/lib/player-data";
import { formatCurrency } from "@/lib/utils";

export type ReleaseForDetail = Prisma.ReleaseGetPayload<{
  include: { tracks: { include: { files: true } } };
}>;

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
  const playerTracks = buildPlayerTracksForRelease(release);

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
            {release.tracks.map((track) => {
              const playerTrack = toPlayerTrack(track, releaseInfo);
              const queueIndex = playerTrack
                ? playerTracks.findIndex((p) => p.trackId === playerTrack.trackId)
                : -1;
              const isCurrent = track.id === highlightedTrackId;
              const rowClass = isCurrent
                ? "rounded-lg border border-neon bg-neon/10 p-3"
                : "rounded-lg border border-border p-3";
              const numberClass = isCurrent
                ? "text-sm text-neon w-6 text-right"
                : "text-sm text-muted-foreground w-6 text-right";
              const nameClass = isCurrent
                ? "text-sm font-medium truncate text-neon"
                : "text-sm font-medium truncate";

              return (
                <div
                  key={track.id}
                  className={rowClass}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  <div className="flex items-center justify-between">
                    {isCurrent ? (
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={numberClass}>{track.trackNumber}</span>
                        <span className={nameClass}>{track.name}</span>
                      </div>
                    ) : (
                      <TracklistRowLink
                        href={`/music/${release.slug}/${track.slug}`}
                        playerTrack={playerTrack}
                        className="flex min-w-0 items-center gap-3 hover:text-neon"
                      >
                        <span className={numberClass}>{track.trackNumber}</span>
                        <span className={nameClass}>{track.name}</span>
                      </TracklistRowLink>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-neon">
                        {formatCurrency(track.price)}
                      </span>
                      <AddToCartButton
                        item={{
                          trackId: track.id,
                          name: track.name,
                          slug: release.slug,
                          price: track.price,
                          coverImageUrl: release.coverImageUrl,
                          releaseName: release.name,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    {playerTrack && queueIndex >= 0 ? (
                      <PlayButton
                        track={playerTrack}
                        queue={playerTracks}
                        index={queueIndex}
                      />
                    ) : null}
                    <TrackProgress
                      trackId={track.id}
                      streamUrl={playerTrack?.streamUrl}
                      alwaysShow
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
