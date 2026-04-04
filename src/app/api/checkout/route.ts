import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/utils";
import { DEFAULT_CURRENCY } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const { productIds } = (await req.json()) as { productIds: number[] };

  if (!productIds || productIds.length === 0) {
    return NextResponse.json({ error: "No products provided" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isPublished: true },
  });

  if (products.length === 0) {
    return NextResponse.json({ error: "No valid products found" }, { status: 400 });
  }

  const baseUrl = getBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: products.map((product) => ({
      price_data: {
        currency: DEFAULT_CURRENCY,
        product_data: {
          name: product.name,
          ...(product.coverImageUrl ? { images: [product.coverImageUrl] } : {}),
        },
        unit_amount: product.price,
      },
      quantity: 1,
    })),
    metadata: {
      product_ids: JSON.stringify(products.map((p) => p.id)),
    },
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cart`,
  });

  return NextResponse.json({ url: session.url });
}
