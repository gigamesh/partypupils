import { DownloadFAQ } from "@/components/DownloadFAQ";
import { OrderDownloads } from "@/components/OrderDownloads";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { fulfillSessionOnDemand } from "@/lib/checkout-fulfillment";
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

/** The order plus everything `OrderDownloads` needs to render its buttons. */
async function findOrderBySession(sessionId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.stripeSessionId, sessionId),
    with: {
      items: {
        with: {
          release: {
            with: {
              tracks: {
                orderBy: (t, { asc }) => asc(t.trackNumber),
                with: { files: true },
              },
            },
          },
          track: { with: { files: true, release: true } },
        },
      },
      downloadTokens: true,
    },
  });
}

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/music");

  let order = await findOrderBySession(session_id);

  // Stripe redirects the buyer here and delivers the webhook in parallel —
  // nothing sequences the two, so on a slow webhook the order isn't on disk yet
  // and the buyer would land on a page with no download links. Record it
  // ourselves instead of waiting; the write is idempotent, so it's safe even
  // with the webhook mid-flight.
  if (!order) {
    const fulfillment = await fulfillSessionOnDemand(session_id);
    // Neither outcome can come from a real purchase through this site's
    // checkout (a forged `session_id`, or another site sharing the Stripe
    // account) — don't show a thank-you page for one.
    if (fulfillment === "site-mismatch" || fulfillment === "no-items") {
      redirect("/music");
    }
    order = await findOrderBySession(session_id);
  }

  if (!order) return <PendingOrder />;

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

/**
 * Shown when the order still isn't readable after we tried to record it — a
 * transient Stripe/database failure, in practice. The webhook is Stripe's own
 * retried delivery and will land the order, so this points the customer at the
 * two durable routes back to their downloads rather than dead-ending them.
 */
function PendingOrder() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ClearCart />
      <h1>Thank you for your purchase!</h1>
      <p className="text-muted-foreground mb-4">
        We&apos;re still finalizing your order. Your download links will be
        emailed to you shortly — refresh this page in a minute, or open the link
        in that email anytime.
      </p>
      <p className="text-muted-foreground mb-8">
        You can also retrieve them anytime from{" "}
        <Link href="/orders/lookup" className="underline hover:text-foreground">
          My Orders
        </Link>
        . Still nothing after a few minutes?{" "}
        <Link href="/contact" className="underline hover:text-foreground">
          Get in touch
        </Link>{" "}
        and we&apos;ll sort it out.
      </p>

      <div className="mt-8 text-center">
        <Button href="/orders/lookup" variant="outline">
          My Orders
        </Button>
      </div>
    </div>
  );
}
