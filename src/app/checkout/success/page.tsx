import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import { ClearCart } from "./ClearCart";
import { DOWNLOAD_TOKEN_EXPIRY_HOURS, DOWNLOAD_TOKEN_MAX } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

export const metadata = {
  title: "Order Complete | Party Pupils",
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/music");

  const order = await prisma.order.findUnique({
    where: { stripeSessionId: session_id },
    include: {
      items: {
        include: {
          release: { include: { tracks: true } },
          track: true,
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
      <h1 className="text-3xl font-bold mb-2">Thank you for your purchase!</h1>
      <p className="text-muted-foreground mb-8">
        Your order is confirmed. Downloads are available below. You can also
        access your downloads anytime from{" "}
        <Link href="/orders/lookup" className="underline hover:text-foreground">
          My Orders
        </Link>
        .
      </p>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Your Downloads</h2>
        <p className="text-sm text-muted-foreground">
          Download links expire in {DOWNLOAD_TOKEN_EXPIRY_HOURS} hours (up to {DOWNLOAD_TOKEN_MAX} downloads).
        </p>

        {order.items.map((item) => {
          if (item.release) {
            return (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.release.name}</p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                  </div>
                  {token && item.release.tracks.length >= 2 && (
                    <DownloadZipButtons token={token} releaseId={item.release.id} />
                  )}
                </div>
                {token && item.release.tracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0 pl-4"
                  >
                    <span className="text-sm">{track.trackNumber}. {track.name}</span>
                    <DownloadButtons token={token} trackId={track.id} />
                  </div>
                ))}
              </div>
            );
          }
          if (item.track) {
            return (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{item.track.name}</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                </div>
                {token && <DownloadButtons token={token} trackId={item.track.id} />}
              </div>
            );
          }
          return null;
        })}

        <div className="pt-3 flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(order.amountTotal)}</span>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/music" className={cn(buttonVariants({ variant: "outline" }))}>
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
