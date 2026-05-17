import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadFAQ } from "@/components/DownloadFAQ";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { toPlayerTrack } from "@/lib/player-data";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Demo Order Detail",
};

export const dynamic = "force-dynamic";

async function getOrCreateValidToken(orderId: number): Promise<string> {
  const existing = await prisma.downloadToken.findFirst({ where: { orderId } });
  if (existing) return existing.token;
  const created = await prisma.downloadToken.create({ data: { orderId } });
  return created.token;
}

export default async function DemoOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const orderId = Number.parseInt(id, 10);
  if (!Number.isFinite(orderId)) notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          release: { include: { tracks: { include: { files: true } } } },
          track: { include: { files: true, release: true } },
        },
      },
    },
  });

  if (!order) notFound();

  const token = await getOrCreateValidToken(order.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Button href="/admin/orders/demo" size="sm" variant="ghost">
          ← All demo orders
        </Button>
      </div>
      <h1>Demo: Order #{order.id}</h1>
      <p className="text-muted-foreground mb-8">
        Rendered with the same components as the post-checkout success page.
        Email on file: <code>{order.email}</code>
      </p>

      <DownloadFAQ />

      <div className="glass-panel mt-8 rounded-lg border p-6 space-y-4">
        <h2>Your Downloads</h2>
        {order.items.map((item) => {
          if (item.release) {
            const releaseInfo = {
              id: item.release.id,
              name: item.release.name,
              slug: item.release.slug,
              coverImageUrl: item.release.coverImageUrl,
            };
            const playerTracks = item.release.tracks
              .map((t) => toPlayerTrack(t, releaseInfo))
              .filter((t): t is NonNullable<typeof t> => t !== null);
            return (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.release.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  {item.release.tracks.length >= 2 && (
                    <DownloadZipButtons
                      token={token}
                      releaseId={item.release.id}
                      availableFormats={[
                        ...new Set(
                          item.release.tracks.flatMap((t) =>
                            t.files.map((f) => f.format),
                          ),
                        ),
                      ]}
                    />
                  )}
                </div>
                {item.release.tracks.map((track) => {
                  const playerTrack = toPlayerTrack(track, releaseInfo);
                  const queueIndex = playerTrack
                    ? playerTracks.findIndex(
                        (p) => p.trackId === playerTrack.trackId,
                      )
                    : -1;
                  return (
                    <div
                      key={track.id}
                      className="border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm">
                          {playerTrack && queueIndex >= 0 && (
                            <PlayButton
                              track={playerTrack}
                              queue={playerTracks}
                              index={queueIndex}
                            />
                          )}
                          {track.trackNumber}. {track.name}
                        </span>
                        <DownloadButtons
                          token={token}
                          trackId={track.id}
                          availableFormats={track.files.map((f) => f.format)}
                        />
                      </div>
                      <TrackProgress trackId={track.id} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (item.track) {
            const trackRelease = item.track.release ?? null;
            const releaseInfo = trackRelease
              ? {
                  id: trackRelease.id,
                  name: trackRelease.name,
                  slug: trackRelease.slug,
                  coverImageUrl: trackRelease.coverImageUrl,
                }
              : { id: 0, name: item.track.name, slug: "", coverImageUrl: null };
            const playerTrack = toPlayerTrack(item.track, releaseInfo);
            return (
              <div
                key={item.id}
                className="border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {playerTrack && (
                      <PlayButton
                        track={playerTrack}
                        queue={[playerTrack]}
                        index={0}
                      />
                    )}
                    <div>
                      <p className="font-medium">{item.track.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                  </div>
                  <DownloadButtons
                    token={token}
                    trackId={item.track.id}
                    availableFormats={item.track.files.map((f) => f.format)}
                  />
                </div>
                <TrackProgress trackId={item.track.id} />
              </div>
            );
          }
          return null;
        })}

        {(() => {
          const trackItems = order.items.filter((item) => item.track);
          if (trackItems.length < 2) return null;
          const formats = [
            ...new Set(
              trackItems.flatMap((item) =>
                item.track!.files.map((f) => f.format),
              ),
            ),
          ];
          return (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Download All Tracks</p>
                <DownloadZipButtons
                  token={token}
                  trackIds={trackItems.map((item) => item.track!.id)}
                  availableFormats={formats}
                />
              </div>
            </div>
          );
        })()}

        <div className="pt-3 flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(order.amountTotal)}</span>
        </div>
      </div>
    </div>
  );
}
