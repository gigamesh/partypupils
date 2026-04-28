/**
 * Stripe webhook tests — focus on the order-creation contract that downloads
 * depend on, plus the deduplication path that protects against retries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
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

    const order = await prisma.order.findUnique({
      where: { stripeSessionId: "cs_test_abc" },
      include: { items: true, downloadTokens: true },
    });
    expect(order?.email).toBe("buyer@test");
    expect(order?.status).toBe("completed");
    expect(order?.items).toHaveLength(2);
    expect(order?.downloadTokens).toHaveLength(1);

    const releaseItem = order?.items.find((i) => i.releaseId === release.id);
    const trackItem = order?.items.find((i) => i.trackId === track.id);
    expect(releaseItem?.price).toBe(release.price);
    expect(trackItem?.price).toBe(track.price);
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

    const orders = await prisma.order.findMany({ where: { stripeSessionId: "cs_test_dup" } });
    expect(orders).toHaveLength(1);
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
    expect(await prisma.order.findUnique({ where: { stripeSessionId: "cs_test_empty" } })).toBeNull();
  });
});
