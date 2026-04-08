import { AddToCartButton } from "@/components/AddToCartButton";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const release = await prisma.release.findUnique({ where: { slug } });
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
  const release = await prisma.release.findUnique({
    where: { slug, isPublished: true },
    include: {
      tracks: {
        orderBy: { trackNumber: "asc" },
        include: { files: true },
      },
    },
  });

  if (!release) notFound();

  const formats = [
    ...new Set(
      release.tracks.flatMap((t) => t.files.map((f) => f.format.toUpperCase())),
    ),
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="glass-panel rounded-xl p-5 space-y-5">
        <div className="flex gap-5">
          <div className="relative w-40 h-40 shrink-0 overflow-hidden rounded-lg bg-muted">
            {release.coverImageUrl ? (
              <Image
                src={release.coverImageUrl}
                alt={release.name}
                fill
                className="object-cover"
                sizes="160px"
                priority
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl text-muted-foreground">
                ♪
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between min-w-0">
            <div>
              <h1 className="text-xl">{release.name}</h1>
              <p className="text-lg font-semibold">
                {formatCurrency(release.price)}
              </p>
            </div>

            {formats.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Includes: {formats.join(", ")}
              </div>
            )}
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
              <div
                key={track.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6 text-right">
                      {track.trackNumber}
                    </span>
                    <span className="text-sm font-medium">{track.name}</span>
                  </div>
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
                  <PlayButton
                    trackId={track.id}
                    previewUrl={track.previewUrl}
                  />
                  <TrackProgress trackId={track.id} alwaysShow />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
