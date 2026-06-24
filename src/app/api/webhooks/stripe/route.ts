import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createStripeWebhookHandler } from "@gigamusic/checkout";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { stripe } from "@/lib/stripe";
import { EMAIL_BRANDING, emailProvider } from "@/lib/email";
import { SITE_ALIAS } from "@/lib/constants";

// Built once at module load. The handler captures the Stripe SDK + queries
// closure; nothing inside reads `process.env` at request time, so this is safe
// to reuse across invocations. We pass our own `stripe()` singleton so tests
// can mock `@/lib/stripe` at the consumer boundary.
const handler = createStripeWebhookHandler({
  stripe: stripe() as unknown as Stripe,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET(),
  queries,
  site: SITE_ALIAS,
  email: emailProvider(),
  branding: EMAIL_BRANDING,
  emailFrom: env.EMAIL_FROM(),
  baseUrl: getBaseUrl(),
  // Magic-link verification reads `email` only; the gigamusic handler signs
  // `orderId` too, which our verify route ignores. ADMIN_SECRET continues to
  // back the order-token signature so existing tokens stay valid.
  orderTokenSecret: env.ADMIN_SECRET(),
});

/**
 * Stripe webhook entry point. Body of the handler lives in
 * `@gigamusic/checkout.createStripeWebhookHandler`; this file is just the
 * env-reading boundary.
 */
export async function POST(req: NextRequest) {
  return handler(req);
}
