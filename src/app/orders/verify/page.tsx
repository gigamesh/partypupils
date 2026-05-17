import { DownloadFAQ } from "@/components/DownloadFAQ";
import { OrderDownloads } from "@/components/OrderDownloads";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { verifyOrderVerificationToken } from "@/lib/order-auth";
import type { Metadata } from "next";

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
          track: { include: { files: true, release: true } },
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

      <DownloadFAQ />

      <div className="mt-8 space-y-6">
        {ordersWithTokens.map((order) => (
          <div key={order.id} className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {order.createdAt.toLocaleDateString()}
            </p>
            <OrderDownloads order={order} token={order.downloadToken} />
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Button href="/music" variant="outline">
          Continue Shopping
        </Button>
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
      <Button href="/orders/lookup">Request New Link</Button>
    </div>
  );
}
