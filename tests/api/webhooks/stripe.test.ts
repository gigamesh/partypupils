/**
 * Stripe webhook tests — focus on the order-creation contract that downloads
 * depend on, plus the deduplication path that protects against retries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { stripe } from "@/lib/stripe";
import { eq } from "drizzle-orm";
import { db, queries } from "@/lib/db";
import { downloadTokens, orderItems, orders } from "@/db/schema";
import { emailSendStub } from "../../setup";
import { makeRelease, makeTrackWithFile } from "../../factories";

function webhookReq(rawBody: string) {
  return new Request("http://test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.mocked(stripe().webhooks.constructEvent).mockReset();
  // emailSendStub is reset by tests/setup.ts. Re-installing a default resolution
  // here is redundant; tests that need a rejection override per-call.
});

describe("POST /api/webhooks/stripe", () => {
  it("400s when the stripe-signature header is missing", async () => {
    const res = await stripeWebhook(
      new Request("http://test/api/webhooks/stripe", { method: "POST", body: "{}" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("400s when constructEvent throws (invalid signature)", async () => {
    vi.mocked(stripe().webhooks.constructEvent).mockImplementationOnce(() => {
      throw new Error("invalid sig");
    });
    const res = await stripeWebhook(webhookReq("{}") as never);
    expect(res.status).toBe(400);
  });

  it("creates an Order with items + a DownloadToken on checkout.session.completed", async () => {
    const release = await makeRelease();
    const track = await makeTrackWithFile(release.id);

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_abc",
          payment_intent: "pi_test_abc",
          amount_total: 999 + 150,
          customer_details: { email: "buyer@test" },
          metadata: {
            release_ids: JSON.stringify([release.id]),
            track_ids: JSON.stringify([track.id]),
          },
        },
      },
    } as never);

    const res = await stripeWebhook(webhookReq("{}") as never);
    expect(res.status).toBe(200);

    const order = await db.query.orders.findFirst({
      where: eq(orders.stripeSessionId, "cs_test_abc"),
      with: { items: true, downloadTokens: true },
    });
    expect(order?.email).toBe("buyer@test");
    expect(order?.status).toBe("completed");
    expect(order?.items).toHaveLength(2);
    expect(order?.downloadTokens).toHaveLength(1);

    const releaseItem = order?.items.find((i: { releaseId: number | null }) => i.releaseId === release.id);
    const trackItem = order?.items.find((i: { trackId: number | null }) => i.trackId === track.id);
    expect(releaseItem?.price).toBe(release.price);
    expect(trackItem?.price).toBe(track.price);
  });

  it("is idempotent against a concurrent duplicate delivery (unique-violation race)", async () => {
    // Simulates two parallel deliveries that both pass the pre-check —
    // one wins the insert, the other hits the unique constraint. Pre-seeding an
    // order with the same stripeSessionId forces the second insert to throw
    // SQLSTATE 23505, which is exactly what the loser of a real race would see.
    const release = await makeRelease();
    await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          stripeSessionId: "cs_test_race",
          email: "first@test",
          amountTotal: release.price,
          status: "completed",
        })
        .returning();
      await tx.insert(orderItems).values({
        orderId: order!.id,
        releaseId: release.id,
        price: release.price,
      });
      await tx.insert(downloadTokens).values({ orderId: order!.id });
    });

    // Bypass the pre-existing-order short-circuit by spying on the
    // `getOrderByStripeSessionId` query once, so we exercise the insert-path
    // unique-violation catch rather than the pre-check branch.
    const findSpy = vi
      .spyOn(queries, "getOrderByStripeSessionId")
      .mockResolvedValueOnce(null as never);

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_race",
          payment_intent: "pi_race",
          amount_total: release.price,
          customer_details: { email: "second@test" },
          metadata: { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        },
      },
    } as never);

    const res = await stripeWebhook(webhookReq("{}") as never);
    // 200 (not 500): we don't want Stripe retrying just because a sibling delivery won the race.
    expect(res.status).toBe(200);
    expect(emailSendStub).not.toHaveBeenCalled();

    // Only the pre-seeded order remains; no duplicate from the loser of the race.
    const orderRows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_test_race"),
    });
    expect(orderRows).toHaveLength(1);
    expect(orderRows[0]?.email).toBe("first@test");

    findSpy.mockRestore();
  });

  it("is idempotent — a retried webhook does not create duplicate Orders", async () => {
    const release = await makeRelease();

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_dup",
          payment_intent: "pi_dup",
          amount_total: 999,
          customer_details: { email: "dup@test" },
          metadata: { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        },
      },
    };

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValue(event as never);

    await stripeWebhook(webhookReq("{}") as never);
    await stripeWebhook(webhookReq("{}") as never);
    // Let any deferred (after()) email sends run before asserting.
    await new Promise((r) => setTimeout(r, 0));

    const orderRows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_test_dup"),
    });
    expect(orderRows).toHaveLength(1);
    // The retry must short-circuit before scheduling another email send.
    expect(emailSendStub).toHaveBeenCalledTimes(1);
  });

  it("still creates an Order when customer_details.email is empty (logs a warning)", async () => {
    const release = await makeRelease();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_no_email",
          payment_intent: "pi_no_email",
          amount_total: 999,
          customer_details: { email: null },
          metadata: { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        },
      },
    } as never);

    const res = await stripeWebhook(webhookReq("{}") as never);
    expect(res.status).toBe(200);

    const order = await db.query.orders.findFirst({
      where: eq(orders.stripeSessionId, "cs_no_email"),
    });
    expect(order).not.toBeUndefined();
    expect(order?.email).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no customer_details.email"));
    expect(emailSendStub).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("does not retry the whole webhook when the confirmation email fails", async () => {
    const release = await makeRelease();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    emailSendStub.mockRejectedValueOnce(new Error("Resend is down"));

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_email_fail",
          payment_intent: "pi_fail",
          amount_total: 999,
          customer_details: { email: "buyer@test" },
          metadata: { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        },
      },
    } as never);

    const res = await stripeWebhook(webhookReq("{}") as never);
    // 200 (not 500): we don't want Stripe retrying just because email send failed.
    expect(res.status).toBe(200);

    const order = await db.query.orders.findFirst({
      where: eq(orders.stripeSessionId, "cs_email_fail"),
    });
    expect(order).not.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to send purchase confirmation"),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it("returns 200 without creating an Order when both id arrays are empty (no work to do)", async () => {
    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_empty",
          metadata: { release_ids: "[]", track_ids: "[]" },
        },
      },
    } as never);

    const res = await stripeWebhook(webhookReq("{}") as never);
    expect(res.status).toBe(200);
    expect(
      await db.query.orders.findFirst({
        where: eq(orders.stripeSessionId, "cs_test_empty"),
      }),
    ).toBeUndefined();
  });
});
