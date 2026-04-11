import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import { PlayButton } from "@/components/PlayButton";
import { TrackProgress } from "@/components/TrackProgress";
import { buttonVariants } from "@/components/ui/button-variants";
import { prisma } from "@/lib/db";
import { verifyOrderVerificationToken } from "@/lib/order-auth";
import { cn, formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export const metadata: Metadata = {
  title: "Your Orders",
};

async function getOrCreateValidToken(orderId: number): Promise<string | null> {
  const existing = await prisma.downloadToken.findFirst({
    where: { orderId },
  });

  if (existing) return existing.token;

  const created = await prisma.downloadToken.create({
    data: { orderId },
  });

  return created.token;
}

export default async function OrderVerifyPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <InvalidLink />;
  }

  const email = await verifyOrderVerificationToken(token);
  if (!email) {
    return <InvalidLink />;
  }

  const orders = await prisma.order.findMany({
    where: { email, status: "completed" },
    include: {
      items: {
        include: {
          release: { include: { tracks: { include: { files: true } } } },
          track: { include: { files: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1>No Orders Found</h1>
        <p className="text-muted-foreground">
          No completed orders found for this email.
        </p>
      </div>
    );
  }

  const ordersWithTokens = await Promise.all(
    orders.map(async (order) => ({
      ...order,
      downloadToken: await getOrCreateValidToken(order.id),
    })),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1>Your Orders</h1>
      <p className="text-muted-foreground mb-8">
        Showing all orders for {email}.
      </p>

      <div className="space-y-6">
        {ordersWithTokens.map((order) => (
          <div key={order.id} className="glass-panel rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{order.createdAt.toLocaleDateString()}</span>
              <span>{formatCurrency(order.amountTotal)}</span>
            </div>

            {order.items.map((item) => {
              if (item.release && order.downloadToken) {
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
                          token={order.downloadToken!}
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
                    {item.release.tracks.map((track) => (
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
                            token={order.downloadToken!}
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
                      {order.downloadToken && (
                        <DownloadButtons
                          token={order.downloadToken}
                          trackId={item.track.id}
                          availableFormats={item.track.files.map(
                            (f) => f.format,
                          )}
                        />
                      )}
                    </div>
                    <TrackProgress trackId={item.track.id} />
                  </div>
                );
              }
              return null;
            })}

            {order.downloadToken && (() => {
              const trackItems = order.items.filter((item) => item.track);
              if (trackItems.length < 2) return null;
              const formats = [...new Set(trackItems.flatMap((item) => item.track!.files.map((f) => f.format)))];
              return (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Download All Tracks</p>
                    <DownloadZipButtons
                      token={order.downloadToken!}
                      trackIds={trackItems.map((item) => item.track!.id)}
                      availableFormats={formats}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
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

function InvalidLink() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1>Invalid or Expired Link</h1>
      <p className="text-muted-foreground mb-6">
        This link is no longer valid. Please request a new one.
      </p>
      <Link href="/orders/lookup" className={cn(buttonVariants())}>
        Request New Link
      </Link>
    </div>
  );
}
