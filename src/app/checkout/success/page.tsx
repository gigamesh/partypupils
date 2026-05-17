import { DownloadFAQ } from "@/components/DownloadFAQ";
import { OrderDownloads } from "@/components/OrderDownloads";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
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
          track: { include: { files: true, release: true } },
        },
      },
      downloadTokens: true,
    },
  });

  if (!order) redirect("/music");

  const token = order.downloadTokens[0]?.token ?? null;

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

      <DownloadFAQ />

      <div className="mt-8">
        <OrderDownloads order={order} token={token} />
      </div>

      <div className="mt-8 text-center">
        <Button href="/music" variant="outline">
          Continue Shopping
        </Button>
      </div>
    </div>
  );
}
