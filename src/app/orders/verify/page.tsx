import Link from "next/link";
import { prisma } from "@/lib/db";
import { verifyOrderVerificationToken } from "@/lib/order-auth";
import { formatCurrency, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { DownloadButtons } from "@/components/DownloadButtons";
import { DOWNLOAD_TOKEN_EXPIRY_MS, DOWNLOAD_TOKEN_EXPIRY_HOURS, DOWNLOAD_TOKEN_MAX } from "@/lib/constants";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export const metadata = {
  title: "Your Orders | Party Pupils",
};

async function getOrCreateValidToken(orderId: number): Promise<string | null> {
  const now = new Date();

  const existing = await prisma.downloadToken.findFirst({
    where: {
      orderId,
      expiresAt: { gt: now },
      downloadCount: { lt: DOWNLOAD_TOKEN_MAX },
    },
  });

  if (existing) return existing.token;

  const created = await prisma.downloadToken.create({
    data: {
      orderId,
      expiresAt: new Date(Date.now() + DOWNLOAD_TOKEN_EXPIRY_MS),
    },
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
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">No Orders Found</h1>
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
    }))
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Your Orders</h1>
      <p className="text-muted-foreground mb-8">
        Showing all orders for {email}. Download links expire in {DOWNLOAD_TOKEN_EXPIRY_HOURS} hours.
      </p>

      <div className="space-y-6">
        {ordersWithTokens.map((order) => (
          <div
            key={order.id}
            className="rounded-lg border border-border p-6 space-y-4"
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{order.createdAt.toLocaleDateString()}</span>
              <span>{formatCurrency(order.amountTotal)}</span>
            </div>

            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(item.price)}
                  </p>
                </div>
                {order.downloadToken && (
                  <DownloadButtons token={order.downloadToken} productId={item.productId} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/music" className={cn(buttonVariants({ variant: "outline" }))}>
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold mb-4">Invalid or Expired Link</h1>
      <p className="text-muted-foreground mb-6">
        This link is no longer valid. Please request a new one.
      </p>
      <Link href="/orders/lookup" className={cn(buttonVariants())}>
        Request New Link
      </Link>
    </div>
  );
}
