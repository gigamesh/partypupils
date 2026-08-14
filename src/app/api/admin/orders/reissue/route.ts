import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queries } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { clientIp } from "@/lib/rate-limit";
import { reissueOrderDownloads } from "@/lib/order-reissue";

// Reissuing hands over paid downloads and can send mail, so the route carries
// its own cap on top of admin auth — a stolen session shouldn't be able to spray
// magic links at arbitrary addresses. Generous enough that a support session
// working through a batch of broken orders never hits it.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

const ReissueSchema = z.object({
  orderId: z.number().int().positive(),
  email: z.string().trim().min(1).optional(),
  confirmEmailChange: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
});

/**
 * Admin "reissue downloads" action for a single order: mints a fresh download
 * token and returns a magic link to the customer's downloads, mailing it unless
 * `sendEmail: false`.
 *
 * A corrected `email` rewrites the order's stored address and therefore requires
 * `confirmEmailChange: true`; without it the route 409s with the current and
 * requested addresses so the caller can present a confirmation step.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ok: allowed } = await queries.consumeRateLimit(
    `admin-order-reissue:${clientIp(req)}`,
    { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS },
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many reissue attempts. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReissueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const result = await reissueOrderDownloads(parsed.data);

  if (!result.ok) {
    switch (result.code) {
      case "not-found":
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      case "not-completed":
        return NextResponse.json(
          {
            error: `Order is ${result.status}, not completed — there is nothing to download.`,
          },
          { status: 409 },
        );
      case "invalid-email":
        return NextResponse.json(
          { error: "Please enter a valid email address." },
          { status: 400 },
        );
      case "email-change-unconfirmed":
        return NextResponse.json(
          {
            error:
              "This address differs from the one on the order. Confirm the change to continue.",
            code: "email-change-unconfirmed",
            currentEmail: result.currentEmail,
            requestedEmail: result.requestedEmail,
          },
          { status: 409 },
        );
    }
  }

  return NextResponse.json(result);
}
