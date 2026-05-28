import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadButtons } from "@/components/DownloadButtons";
import { PlayButton } from "@/components/PlayButton";
import { ReleaseDetail } from "@/components/ReleaseDetail";
import { TrackProgress } from "@/components/TrackProgress";
import { tokenGrantsTrack } from "@/lib/download-auth";
import { buildPlayerTracksForRelease, toPlayerTrack } from "@/lib/player-data";
import { getTrackByReleaseAndSlug } from "@/lib/release-reads";
import { formatCurrency } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string; trackSlug: string }>;
  searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, trackSlug } = await params;
  const track = await getTrackByReleaseAndSlug(slug, trackSlug);
  if (!track) return { title: "Not Found" };
  const title = `${track.name} — ${track.release.name}`;
  return {
    title,
    description: track.release.description ?? undefined,
    openGraph: track.release.coverImageUrl
      ? { images: [{ url: track.release.coverImageUrl, alt: title }] }
      : undefined,
  };
}

export default async function TrackPage({ params, searchParams }: Props) {
  const { slug, trackSlug } = await params;
  const track = await getTrackByReleaseAndSlug(slug, trackSlug);
  if (!track) notFound();

  const release = track.release;
  const releaseInfo = {
    id: release.id,
    name: release.name,
    slug: release.slug,
    coverImageUrl: release.coverImageUrl,
  };
  const playerTrack = toPlayerTrack(track, releaseInfo);
  const playerTracks = buildPlayerTracksForRelease(release);
  const queueIndex = playerTrack
    ? playerTracks.findIndex((p) => p.trackId === playerTrack.trackId)
    : -1;

  const availableFormats = [
    ...new Set(track.files.map((f) => f.format.toLowerCase())),
  ];

  const { token } = await searchParams;
  const showDownloads =
    !!token && (await tokenGrantsTrack(token, track.id));

  return (
    <ReleaseDetail
      release={release}
      highlightedTrackId={track.id}
      header={
        <>
          <div>
            <h1 className="text-xl">{track.name}</h1>
            <Link href={`/music/${release.slug}`} className="neon-link text-sm">
              {release.name}
            </Link>
            <p className="pt-1 text-lg font-semibold text-neon">
              {formatCurrency(track.price)}
            </p>
          </div>

          <div className="flex items-center gap-2">
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

          {showDownloads && availableFormats.length > 0 && token && (
            <DownloadButtons
              formats={availableFormats.map((format) => ({
                format,
                href: `/download/${token}?trackId=${track.id}&format=${format}`,
              }))}
            />
          )}
        </>
      }
    />
  );
}
