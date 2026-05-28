import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createStripeWebhookHandler } from "@gigamusic/checkout";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/utils";
import { stripe } from "@/lib/stripe";
import { EMAIL_BRANDING, emailProvider } from "@/lib/email";

const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

const handler = createStripeWebhookHandler({
  // Pass our own singleton so tests can mock `@/lib/stripe` at this boundary.
  stripe: stripe() as unknown as Stripe,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET(),
  queries,
  email: emailProvider(),
  branding: EMAIL_BRANDING,
  emailFrom: env.EMAIL_FROM(),
  baseUrl: getBaseUrl(),
  // ADMIN_SECRET signs the order tokens — kept as-is so previously-issued
  // magic links stay valid.
  orderTokenSecret: env.ADMIN_SECRET(),
});

export async function POST(req: NextRequest) {
  return handler(req);
}
