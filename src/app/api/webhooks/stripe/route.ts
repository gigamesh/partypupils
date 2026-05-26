import { NextRequest, NextResponse, after } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import Stripe from "stripe";
import { sendPurchaseConfirmationEmail } from "@/lib/email";
import { createOrderVerificationToken } from "@/lib/order-auth";

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET()
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Idempotency check first — Stripe retries duplicate-deliver this same event,
    // so short-circuit before any other DB work.
    const existingOrder = await prisma.order.findUnique({
      where: { stripeSessionId: session.id },
    });
    if (existingOrder) {
      return NextResponse.json({ received: true });
    }

    const releaseIds: number[] = JSON.parse(session.metadata?.release_ids || "[]");
    const trackIds: number[] = JSON.parse(session.metadata?.track_ids || "[]");

    if (releaseIds.length === 0 && trackIds.length === 0) {
      return NextResponse.json({ received: true });
    }

    const [releases, tracks] = await Promise.all([
      releaseIds.length > 0
        ? prisma.release.findMany({ where: { id: { in: releaseIds } } })
        : [],
      trackIds.length > 0
        ? prisma.track.findMany({ where: { id: { in: trackIds } } })
        : [],
    ]);

    const orderItems = [
      ...releases.map((r) => ({ releaseId: r.id, price: r.price })),
      ...tracks.map((t) => ({ trackId: t.id, price: t.price })),
    ];

    const email = session.customer_details?.email || "";

    try {
      await prisma.order.create({
        data: {
          stripeSessionId: session.id,
          stripePaymentId: session.payment_intent as string | null,
          email,
          amountTotal: session.amount_total || 0,
          status: "completed",
          items: { create: orderItems },
          downloadTokens: { create: {} },
        },
      });
    } catch (err) {
      // Two webhook deliveries (or a retry that lands while we're still
      // processing the first) can both pass the findUnique check above and race
      // here. The unique constraint on stripeSessionId guarantees only one
      // wins; the loser surfaces as P2002. Treat that as the same idempotent
      // short-circuit as the findUnique branch — no email send, no 500, no
      // Stripe retry.
      if (isUniqueConstraintError(err)) {
        return NextResponse.json({ received: true });
      }
      throw err;
    }

    if (!email) {
      // Stripe almost always supplies an email but doesn't guarantee it. The order is
      // safely recorded; without an email we have no way to send the verification link
      // back to the customer — manual intervention required.
      console.warn(
        `[stripe-webhook] checkout.session.completed (session=${session.id}) has no customer_details.email — order recorded but customer cannot retrieve downloads.`,
      );
    } else {
      // Defer email send past the response. Stripe sees a fast 200 instead of waiting on
      // Resend; a failure here is logged but never causes a retry (the order is already
      // recorded and idempotency would short-circuit a replay anyway).
      const itemNames = [
        ...releases.map((r) => r.name),
        ...tracks.map((t) => t.name),
      ];
      after(async () => {
        try {
          const verifyToken = await createOrderVerificationToken(email);
          const verifyUrl = `${env.NEXT_PUBLIC_BASE_URL()}/orders/verify?token=${verifyToken}`;
          await sendPurchaseConfirmationEmail(
            email,
            verifyUrl,
            itemNames,
            session.amount_total ?? 0,
          );
        } catch (err) {
          console.error(
            `[stripe-webhook] failed to send purchase confirmation to ${email} for session ${session.id}:`,
            err,
          );
        }
      });
    }
  }

  return NextResponse.json({ received: true });
}
