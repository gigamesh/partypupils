import { DownloadFAQ } from "@/components/DownloadFAQ";
import { OrderDownloads } from "@/components/OrderDownloads";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
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
      <DownloadFAQ />

      <div className="mt-8">
        <OrderDownloads order={order} token={token} />
      </div>
    </div>
  );
}
