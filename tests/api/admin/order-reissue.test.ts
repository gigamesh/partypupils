/**
 * Admin "reissue downloads" action. Auth defaults to authed via the global mock
 * in tests/setup.ts. The cases that matter are the ones that hand over paid
 * downloads: who the link is signed for, and what it takes to redirect one to a
 * different address.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { POST } from "@/app/api/admin/orders/reissue/route";
import { verifyAdminSession } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { downloadTokens, orders } from "@/db/schema";
import { verifyOrderVerificationToken } from "@/lib/order-auth";
import { makeCompletedOrder, makeRelease, makeTrackWithFile } from "../../factories";
import { emailSendStub } from "../../setup";

function reissueRequest(body: unknown): NextRequest {
  return new Request("http://test/api/admin/orders/reissue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

/** The email a magic link resolves to — what actually gates access. */
async function emailBehindLink(verifyUrl: string): Promise<string | null> {
  const token = new URL(verifyUrl).searchParams.get("token") ?? "";
  return verifyOrderVerificationToken(token);
}

describe("POST /api/admin/orders/reissue", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(verifyAdminSession).mockResolvedValueOnce(false);
    const res = await POST(reissueRequest({ orderId: 1 }));
    expect(res.status).toBe(401);
    expect(emailSendStub).not.toHaveBeenCalled();
  });

  it("mints a new token, keeps the old one, and emails the customer", async () => {
    const release = await makeRelease({ name: "Yacht House Vol 3" });
    const order = await makeCompletedOrder({
      email: "buyer@example.com",
      releaseIds: [release.id],
    });

    const res = await POST(reissueRequest({ orderId: order.id }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(body.email).toBe("buyer@example.com");
    expect(body.previousEmail).toBeNull();
    expect(body.existingTokenCount).toBe(1);
    expect(body.itemNames).toEqual(["Yacht House Vol 3"]);

    const tokens = await db.query.downloadTokens.findMany({
      where: eq(downloadTokens.orderId, order.id),
      orderBy: asc(downloadTokens.id),
    });
    // Additive, not destructive: the link the customer already has still works.
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.token).toBe(order.downloadTokens[0]!.token);
    expect(tokens[1]!.token).toBe(body.downloadToken);

    expect(emailSendStub).toHaveBeenCalledTimes(1);
    expect(emailSendStub).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com" }),
    );
    expect(await emailBehindLink(body.verifyUrl)).toBe("buyer@example.com");
  });

  it("names single-track purchases the way the purchase email does", async () => {
    const release = await makeRelease({ name: "Yacht House Vol 3" });
    const track = await makeTrackWithFile(release.id, { name: "Sundress" });
    const order = await makeCompletedOrder({
      email: "buyer@example.com",
      trackIds: [track.id],
    });

    const body = await (await POST(reissueRequest({ orderId: order.id }))).json();
    expect(body.itemNames).toEqual(["Yacht House Vol 3 — Sundress"]);
  });

  it("returns the link without sending when sendEmail is false", async () => {
    const order = await makeCompletedOrder({ email: "buyer@example.com" });

    const body = await (
      await POST(reissueRequest({ orderId: order.id, sendEmail: false }))
    ).json();

    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBeNull();
    expect(body.verifyUrl).toContain("/orders/verify?token=");
    expect(emailSendStub).not.toHaveBeenCalled();
  });

  it("still returns the link when the mail provider fails", async () => {
    emailSendStub.mockRejectedValueOnce(new Error("Resend is down"));
    const order = await makeCompletedOrder({ email: "buyer@example.com" });

    const res = await POST(reissueRequest({ orderId: order.id }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe("Resend is down");
    expect(await emailBehindLink(body.verifyUrl)).toBe("buyer@example.com");
  });

  it("404s for an unknown order", async () => {
    const res = await POST(reissueRequest({ orderId: 999999 }));
    expect(res.status).toBe(404);
  });

  it("409s for an order that was never completed", async () => {
    const [pending] = await db
      .insert(orders)
      .values({
        stripeSessionId: "cs_test_pending",
        email: "buyer@example.com",
        amountTotal: 999,
        status: "pending",
      })
      .returning();

    const res = await POST(reissueRequest({ orderId: pending!.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("pending");
    expect(emailSendStub).not.toHaveBeenCalled();
  });

  it("400s on a malformed body", async () => {
    expect((await POST(reissueRequest({ orderId: "12" }))).status).toBe(400);
    expect((await POST(reissueRequest({}))).status).toBe(400);
  });
});

describe("POST /api/admin/orders/reissue — corrected email", () => {
  it("refuses a different address without explicit confirmation", async () => {
    const order = await makeCompletedOrder({ email: "typo@gmial.com" });

    const res = await POST(
      reissueRequest({ orderId: order.id, email: "real@gmail.com" }),
    );
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.code).toBe("email-change-unconfirmed");
    expect(body.currentEmail).toBe("typo@gmial.com");
    expect(body.requestedEmail).toBe("real@gmail.com");

    // Nothing was handed over: no mail, no new token, order untouched.
    expect(emailSendStub).not.toHaveBeenCalled();
    const after = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(after!.email).toBe("typo@gmial.com");
    const tokens = await db.query.downloadTokens.findMany({
      where: eq(downloadTokens.orderId, order.id),
    });
    expect(tokens).toHaveLength(1);
  });

  it("rewrites the order and signs the link for the corrected address once confirmed", async () => {
    const order = await makeCompletedOrder({ email: "typo@gmial.com" });

    const res = await POST(
      reissueRequest({
        orderId: order.id,
        email: "real@gmail.com",
        confirmEmailChange: true,
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.email).toBe("real@gmail.com");
    expect(body.previousEmail).toBe("typo@gmial.com");

    // The order row has to move too — /orders/verify resolves a link by
    // matching the token's email against orders.email, so a link signed for an
    // address the order doesn't carry would resolve to nothing.
    const after = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(after!.email).toBe("real@gmail.com");
    expect(await emailBehindLink(body.verifyUrl)).toBe("real@gmail.com");
    expect(emailSendStub).toHaveBeenCalledWith(
      expect.objectContaining({ to: "real@gmail.com" }),
    );
  });

  it("treats a case-only difference as the same address, no confirmation needed", async () => {
    const order = await makeCompletedOrder({ email: "buyer@example.com" });

    const res = await POST(
      reissueRequest({ orderId: order.id, email: "Buyer@Example.com" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.previousEmail).toBeNull();
    expect(body.email).toBe("buyer@example.com");
  });

  it("400s on a malformed corrected address even when confirmed", async () => {
    const order = await makeCompletedOrder({ email: "buyer@example.com" });

    const res = await POST(
      reissueRequest({
        orderId: order.id,
        email: "not-an-email",
        confirmEmailChange: true,
      }),
    );
    expect(res.status).toBe(400);

    const after = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    expect(after!.email).toBe("buyer@example.com");
  });
});

describe("POST /api/admin/orders/reissue — rate limiting", () => {
  it("429s once the per-IP window is exhausted", async () => {
    const order = await makeCompletedOrder({ email: "buyer@example.com" });

    const send = () =>
      POST(
        new Request("http://test/api/admin/orders/reissue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "203.0.113.9",
          },
          body: JSON.stringify({ orderId: order.id, sendEmail: false }),
        }) as NextRequest,
      );

    for (let i = 0; i < 20; i++) {
      expect((await send()).status).toBe(200);
    }
    expect((await send()).status).toBe(429);
  });
});
