import Link from "next/link";
import { AddToCartButton } from "@/components/AddToCartButton";
import Image from "@/components/Image";
import { PlayButton } from "@/components/PlayButton";
import type { SearchableTrack } from "@/lib/track-search";
import { formatCurrency } from "@/lib/utils";

/**
 * The admin-chosen song, given its own full-width row between the bundles grid
 * and the release grid on `/music`. Panelled like `BundleCard` so it reads as
 * part of the same stack rather than a promo strip bolted onto it.
 */
export function FeaturedSongCard({ song }: { song: SearchableTrack }) {
  const { track, release, playerTrack } = song;
  const href = `/music/${release.slug}/${track.slug}`;

  return (
    // @container, like BundleCard, so the card lays itself out by its own width
    // rather than the viewport's.
    <div className="@container rounded-lg glass-panel p-4">
      <div className="flex h-full flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={href}
            className="relative size-16 shrink-0 overflow-hidden rounded bg-muted"
          >
            {release.coverImageUrl ? (
              <Image
                src={release.coverImageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="80px"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-neon/30">
                ♪
              </span>
            )}
          </Link>
          <div>
            <span className="block text-xs uppercase tracking-wide text-neon">
              Featured Song
            </span>
            <h3 className="text-base font-semibold">
              <Link href={href} className="hover:text-neon">
                {track.name}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{release.name}</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-lg font-bold text-neon">
                {formatCurrency(track.price)}
              </span>
              {playerTrack && <PlayButton track={playerTrack} />}
            </div>
          </div>
        </div>

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
    </div>
  );
}
