import type { NextRequest } from "next/server";
import { createStripeWebhookHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { EMAIL_BRANDING, emailProvider } from "@/lib/email";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

// Built once at module load. The handler captures the Stripe SDK + queries
// closure; nothing inside reads `process.env` at request time, so this is safe
// to reuse across invocations.
const handler = createStripeWebhookHandler({
  stripeSecret: env.STRIPE_SECRET_KEY(),
  webhookSecret: env.STRIPE_WEBHOOK_SECRET(),
  queries,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler(req as any);
}
