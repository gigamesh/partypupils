import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import { Badge } from "@/components/ui/badge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const release = await prisma.release.findUnique({ where: { slug } });
  if (!release) return { title: "Not Found" };
  return {
    title: `${release.name} | Party Pupils`,
    description: release.description || `Buy ${release.name} by Party Pupils.`,
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
    ...new Set(release.tracks.flatMap((t) => t.files.map((f) => f.format.toUpperCase()))),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {release.coverImageUrl ? (
            <Image
              src={release.coverImageUrl}
              alt={release.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-muted-foreground">
              ♪
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <Badge variant="secondary" className="mb-2">
              {release.type}
            </Badge>
            <h1 className="text-3xl font-bold">{release.name}</h1>
            <p className="mt-1 text-2xl font-semibold">
              {formatCurrency(release.price)}
            </p>
          </div>

          {release.description && (
            <p className="text-muted-foreground">{release.description}</p>
          )}

          {formats.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Includes: {formats.join(", ")}
            </div>
          )}

          <AddToCartButton
            item={{
              releaseId: release.id,
              name: release.name,
              slug: release.slug,
              price: release.price,
              coverImageUrl: release.coverImageUrl,
            }}
          />

          {release.tracks.length > 1 && (
            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-3">Tracklist</h2>
              <div className="space-y-2">
                {release.tracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
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
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
