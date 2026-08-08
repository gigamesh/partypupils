import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createStripeWebhookHandler } from "@gigamusic/checkout";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { purchaseConfirmationDeps } from "@/lib/checkout-fulfillment";
import { SITE_ALIAS } from "@/lib/constants";

// Built once at module load. The handler captures the Stripe SDK + queries
// closure; nothing inside reads `process.env` at request time, so this is safe
// to reuse across invocations. We pass our own `stripe()` singleton so tests
// can mock `@/lib/stripe` at the consumer boundary.
//
// The email deps come from `checkout-fulfillment` because the success page can
// also record an order (racing this webhook) and must send the identical
// confirmation when it wins.
const handler = createStripeWebhookHandler({
  stripe: stripe() as unknown as Stripe,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET(),
  queries,
  site: SITE_ALIAS,
  ...purchaseConfirmationDeps(),
});

/**
 * Stripe webhook entry point. Body of the handler lives in
 * `@gigamusic/checkout.createStripeWebhookHandler`; this file is just the
 * env-reading boundary.
 */
export async function POST(req: NextRequest) {
  return handler(req);
}
