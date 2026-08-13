import { AddToCartButton } from "@/components/AddToCartButton";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { TracklistRowLink } from "@/components/TracklistRowLink";
import type { PlayerTrack } from "@/lib/player-types";
import { cn, formatCurrency } from "@/lib/utils";

export interface TrackRowTrack {
  id: number;
  name: string;
  slug: string;
  price: number;
  trackNumber: number;
}

export interface TrackRowRelease {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
}

interface Props {
  track: TrackRowTrack;
  release: TrackRowRelease;
  /** Null when the track has no mp3 file — the row then renders without a play button. */
  playerTrack: PlayerTrack | null;
  /** Renders the row in neon and drops the link, for the track's own page. */
  highlighted?: boolean;
  /** Extra classes on the row container — the search results add `glass-panel`. */
  className?: string;
}

/**
 * One purchasable song row: number, name, price, add-to-cart, play button and
 * progress bar. Shared by the release tracklist, the song page and the /music
 * search results.
 */
export function TrackRow({
  track,
  release,
  playerTrack,
  highlighted = false,
  className,
}: Props) {
  const rowClass = cn(
    highlighted
      ? "rounded-lg border border-neon bg-neon/10 p-3"
      : "rounded-lg border border-border p-3",
    className,
  );
  const numberClass = highlighted
    ? "text-sm text-neon w-6 text-right"
    : "text-sm text-muted-foreground w-6 text-right";
  const nameClass = highlighted
    ? "text-sm font-medium sm:truncate text-neon"
    : "text-sm font-medium sm:truncate";

  return (
    <div className={rowClass} aria-current={highlighted ? "page" : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {highlighted ? (
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
            <span className={numberClass}>{track.trackNumber}</span>
            <span className={nameClass}>{track.name}</span>
          </div>
        ) : (
          <TracklistRowLink
            href={`/music/${release.slug}/${track.slug}`}
            playerTrack={playerTrack}
            className="flex w-full min-w-0 items-center gap-3 hover:text-neon sm:w-auto sm:flex-1"
          >
            <span className={numberClass}>{track.trackNumber}</span>
            <span className={nameClass}>{track.name}</span>
          </TracklistRowLink>
        )}
        <div className="order-last ml-auto flex items-center gap-3 sm:order-none">
          <span className="text-sm text-neon">{formatCurrency(track.price)}</span>
          <AddToCartButton
            item={{
              trackId: track.id,
              parentReleaseId: release.id,
              name: track.name,
              slug: release.slug,
              price: track.price,
              coverImageUrl: release.coverImageUrl,
              releaseName: release.name,
            }}
          />
        </div>
        <div className="flex w-full items-center gap-2">
          {playerTrack ? <PlayButton track={playerTrack} /> : null}
          <TrackProgress
            trackId={track.id}
            streamUrl={playerTrack?.streamUrl}
            alwaysShow
          />
        </div>
      </div>
    </div>
  );
}
