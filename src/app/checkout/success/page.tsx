import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { buttonVariants } from "@/components/ui/button-variants";
import { prisma } from "@/lib/db";
import { cn, formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClearCart } from "./ClearCart";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

export const metadata: Metadata = {
  title: "Order Complete",
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/music");

  const order = await prisma.order.findUnique({
    where: { stripeSessionId: session_id },
    include: {
      items: {
        include: {
          release: { include: { tracks: { include: { files: true } } } },
          track: { include: { files: true } },
        },
      },
      downloadTokens: true,
    },
  });

  if (!order) redirect("/music");

  const token = order.downloadTokens[0]?.token;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ClearCart />
      <h1>Thank you for your purchase!</h1>
      <p className="text-muted-foreground mb-8">
        Your order is confirmed. Downloads are available below. You can also
        access your downloads anytime from{" "}
        <Link href="/orders/lookup" className="underline hover:text-foreground">
          My Orders
        </Link>
        .
      </p>

      <div className="glass-panel rounded-lg border p-6 space-y-4">
        <h2>Your Downloads</h2>
        {order.items.map((item) => {
          if (item.release) {
            return (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.release.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  {token && item.release.tracks.length >= 2 && (
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
                {token &&
                  item.release.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm">
                          <PlayButton
                            trackId={track.id}
                            previewUrl={track.previewUrl}
                          />
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
                  ))}
              </div>
            );
          }
          if (item.track) {
            return (
              <div
                key={item.id}
                className="border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlayButton
                      trackId={item.track.id}
                      previewUrl={item.track.previewUrl}
                    />
                    <div>
                      <p className="font-medium">{item.track.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                  </div>
                  {token && (
                    <DownloadButtons
                      token={token}
                      trackId={item.track.id}
                      availableFormats={item.track.files.map((f) => f.format)}
                    />
                  )}
                </div>
                <TrackProgress trackId={item.track.id} />
              </div>
            );
          }
          return null;
        })}

        {token && (() => {
          const trackItems = order.items.filter((item) => item.track);
          if (trackItems.length < 2) return null;
          const formats = [...new Set(trackItems.flatMap((item) => item.track!.files.map((f) => f.format)))];
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

      <div className="mt-8 text-center">
        <Link
          href="/music"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
