import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayReleaseButton } from "@/components/PlayReleaseButton";
import { ReleaseDetail } from "@/components/ReleaseDetail";
import { buildPlayerTracksForRelease } from "@/lib/player-data";
import { getReleaseBySlug } from "@/lib/release-reads";
import { formatCurrency } from "@/lib/utils";

// ISR: serve cached HTML from the CDN and revalidate hourly. Admin writes call
// revalidateTag(), so published changes appear immediately without a redeploy.
// Rendering per-request (force-dynamic) re-queried Postgres on every visit,
// which kept Neon's compute awake around the clock. Unknown slugs are still
// generated on demand and then cached (dynamicParams defaults to true).
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const release = await getReleaseBySlug(slug);
  if (!release) return { title: "Not Found" };
  return {
    title: release.name,
    description: release.description,
    openGraph: release.coverImageUrl
      ? {
          images: [{ url: release.coverImageUrl, alt: release.name }],
        }
      : undefined,
  };
}

export default async function ReleasePage({ params }: Props) {
  const { slug } = await params;
  const release = await getReleaseBySlug(slug);

  if (!release) notFound();

  const formats = [
    ...new Set(
      release.tracks.flatMap((t) => t.files.map((f) => f.format.toUpperCase())),
    ),
  ];
  const playerTracks = buildPlayerTracksForRelease(release);

  return (
    <ReleaseDetail
      release={release}
      header={
        <>
          <div>
            <h1 className="text-xl">{release.name}</h1>
            <p className="text-lg font-semibold">
              {formatCurrency(release.price)}
            </p>
          </div>

          {playerTracks.length > 0 && (
            <PlayReleaseButton tracks={playerTracks} />
          )}

          {formats.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Includes: {formats.join(", ")}
            </div>
          )}
        </>
      }
    />
  );
}
