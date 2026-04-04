import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import Stripe from "stripe";
import { DOWNLOAD_TOKEN_EXPIRY_MS } from "@/lib/constants";

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
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

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

    await prisma.order.create({
      data: {
        stripeSessionId: session.id,
        stripePaymentId: session.payment_intent as string | null,
        email: session.customer_details?.email || "",
        amountTotal: session.amount_total || 0,
        status: "completed",
        items: { create: orderItems },
        downloadTokens: {
          create: {
            expiresAt: new Date(Date.now() + DOWNLOAD_TOKEN_EXPIRY_MS),
          },
        },
      },
    });
  }

  return NextResponse.json({ received: true });
}
