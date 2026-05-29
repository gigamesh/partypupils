import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { createOrderVerificationToken } from "@/lib/order-auth";
import { sendOrderLookupEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.email, email), eq(orders.status, "completed")),
  });

  if (!order) {
    return NextResponse.json({ error: "No orders found" }, { status: 404 });
  }

  const token = await createOrderVerificationToken(email);
  const verifyUrl = `${getBaseUrl()}/orders/verify?token=${token}`;

  await sendOrderLookupEmail(email, verifyUrl);

  return NextResponse.json({ success: true });
}
