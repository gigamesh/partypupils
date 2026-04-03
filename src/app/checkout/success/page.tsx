import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClearCart } from "./ClearCart";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

export const metadata = {
  title: "Order Complete | Party Pupils",
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/store");

  const order = await prisma.order.findUnique({
    where: { stripeSessionId: session_id },
    include: {
      items: { include: { product: true } },
      downloadTokens: true,
    },
  });

  if (!order) redirect("/store");

  const token = order.downloadTokens[0]?.token;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ClearCart />
      <h1 className="text-3xl font-bold mb-2">Thank you for your purchase!</h1>
      <p className="text-muted-foreground mb-8">
        A confirmation has been sent to {order.email}.
      </p>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="font-semibold text-lg">Your Downloads</h2>
        <p className="text-sm text-muted-foreground">
          Download links expire in 72 hours (up to 10 downloads).
        </p>

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
            {token && (
              <div className="flex gap-2">
                <a
                  href={`/download/${token}?productId=${item.productId}&format=mp3`}
                  className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                >
                  MP3
                </a>
                <a
                  href={`/download/${token}?productId=${item.productId}&format=wav`}
                  className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                >
                  WAV
                </a>
              </div>
            )}
          </div>
        ))}

        <div className="pt-3 flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(order.amountTotal)}</span>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/store" className={cn(buttonVariants({ variant: "outline" }))}>
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
