import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY } from "@/lib/constants";

interface CartItem {
  releaseId?: number;
  trackId?: number;
}

export async function POST(req: NextRequest) {
  const { items } = (await req.json()) as { items: CartItem[] };

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const releaseIds = items.filter((i) => i.releaseId).map((i) => i.releaseId!);
  const trackIds = items.filter((i) => i.trackId).map((i) => i.trackId!);

  const [releases, tracks] = await Promise.all([
    releaseIds.length > 0
      ? prisma.release.findMany({ where: { id: { in: releaseIds }, isPublished: true } })
      : [],
    trackIds.length > 0
      ? prisma.track.findMany({ where: { id: { in: trackIds } }, include: { release: true } })
      : [],
  ]);

  const lineItems = [
    ...releases.map((r) => ({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: r.name,
          ...(r.coverImageUrl ? { images: [r.coverImageUrl] } : {}),
        },
        unit_amount: r.price,
      },
      quantity: 1 as const,
    })),
    ...tracks.map((t) => ({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: `${t.release.name} — ${t.name}`,
          ...(t.release.coverImageUrl ? { images: [t.release.coverImageUrl] } : {}),
        },
        unit_amount: t.price,
      },
      quantity: 1 as const,
    })),
  ];

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "No valid items found" }, { status: 400 });
  }

  const baseUrl = getBaseUrl();

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: {
        release_ids: JSON.stringify(releases.map((r) => r.id)),
        track_ids: JSON.stringify(tracks.map((t) => t.id)),
      },
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
