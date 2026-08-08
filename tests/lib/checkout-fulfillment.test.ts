/**
 * On-demand fulfillment — the success page's escape from the redirect/webhook
 * race. These cover the properties the page depends on: the order exists after
 * one call, a webhook arriving afterwards is a no-op, and the customer is
 * emailed exactly once no matter which path recorded the order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { fulfillSessionOnDemand } from "@/lib/checkout-fulfillment";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import { SITE_ALIAS } from "@/lib/constants";
import { emailSendStub } from "../setup";
import { makeRelease, makeTrackWithFile } from "../factories";

function paidSession(
  sessionId: string,
  metadata: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: sessionId,
    payment_intent: `pi_${sessionId}`,
    payment_status: "paid",
    amount_total: 999,
    customer_details: { email: "buyer@test" },
    metadata: { site: SITE_ALIAS, ...metadata },
    ...overrides,
  };
}

function webhookReq() {
  return new Request("http://test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body: "{}",
  }) as never;
}

beforeEach(() => {
  vi.mocked(stripe().checkout.sessions.retrieve).mockReset();
  vi.mocked(stripe().webhooks.constructEvent).mockReset();
});

describe("fulfillSessionOnDemand", () => {
  it("records the order + download token without the webhook ever firing", async () => {
    const release = await makeRelease();
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(
      paidSession("cs_ondemand", {
        release_ids: JSON.stringify([release.id]),
        track_ids: "[]",
      }) as never,
    );

    const status = await fulfillSessionOnDemand("cs_ondemand");
    expect(status).toBe("created");

    const order = await db.query.orders.findFirst({
      where: eq(orders.stripeSessionId, "cs_ondemand"),
      with: { items: true, downloadTokens: true },
    });
    // The download token is what the success page renders links from — without
    // it the page shows track names and no buttons.
    expect(order?.downloadTokens).toHaveLength(1);
    expect(order?.items).toHaveLength(1);
    expect(order?.email).toBe("buyer@test");
  });

  it("emails the confirmation itself when it beats the webhook", async () => {
    const release = await makeRelease();
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(
      paidSession("cs_email_once", {
        release_ids: JSON.stringify([release.id]),
        track_ids: "[]",
      }) as never,
    );

    await fulfillSessionOnDemand("cs_email_once");
    await vi.waitFor(() => expect(emailSendStub).toHaveBeenCalledTimes(1));
    expect(emailSendStub).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@test" }),
    );
  });

  it("does not email twice when the webhook lands after the page fulfilled", async () => {
    const release = await makeRelease();
    const session = paidSession("cs_then_webhook", {
      release_ids: JSON.stringify([release.id]),
      track_ids: "[]",
    });
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(session as never);

    expect(await fulfillSessionOnDemand("cs_then_webhook")).toBe("created");
    await vi.waitFor(() => expect(emailSendStub).toHaveBeenCalledTimes(1));

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: session },
    } as never);
    const res = await stripeWebhook(webhookReq());

    expect(res.status).toBe(200);
    expect(emailSendStub).toHaveBeenCalledTimes(1);
    const rows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_then_webhook"),
    });
    expect(rows).toHaveLength(1);
  });

  it("reports already-recorded (and stays silent) when the webhook won", async () => {
    const release = await makeRelease();
    const session = paidSession("cs_webhook_first", {
      release_ids: JSON.stringify([release.id]),
      track_ids: "[]",
    });

    vi.mocked(stripe().webhooks.constructEvent).mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: session },
    } as never);
    await stripeWebhook(webhookReq());
    await vi.waitFor(() => expect(emailSendStub).toHaveBeenCalledTimes(1));

    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(session as never);
    expect(await fulfillSessionOnDemand("cs_webhook_first")).toBe("already-recorded");
    expect(emailSendStub).toHaveBeenCalledTimes(1);
  });

  it("survives concurrent calls without duplicating the order", async () => {
    const release = await makeRelease();
    const track = await makeTrackWithFile(release.id);
    const session = paidSession("cs_concurrent", {
      release_ids: "[]",
      track_ids: JSON.stringify([track.id]),
    });
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValue(session as never);

    // Two renders of the success page (a refresh, or a prefetch) hitting at once.
    const results = await Promise.all([
      fulfillSessionOnDemand("cs_concurrent"),
      fulfillSessionOnDemand("cs_concurrent"),
    ]);

    expect(results.filter((r) => r === "created")).toHaveLength(1);
    const rows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_concurrent"),
    });
    expect(rows).toHaveLength(1);
    await vi.waitFor(() => expect(emailSendStub).toHaveBeenCalledTimes(1));
  });

  it("refuses a session belonging to another site sharing the Stripe account", async () => {
    const release = await makeRelease();
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(
      paidSession(
        "cs_other_site",
        { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        { metadata: { site: "some-other-artist", release_ids: JSON.stringify([release.id]), track_ids: "[]" } },
      ) as never,
    );

    expect(await fulfillSessionOnDemand("cs_other_site")).toBe("site-mismatch");
    const rows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_other_site"),
    });
    expect(rows).toHaveLength(0);
  });

  it("refuses a payment that has not cleared yet", async () => {
    const release = await makeRelease();
    vi.mocked(stripe().checkout.sessions.retrieve).mockResolvedValueOnce(
      paidSession(
        "cs_unpaid",
        { release_ids: JSON.stringify([release.id]), track_ids: "[]" },
        { payment_status: "unpaid" },
      ) as never,
    );

    // Delayed-notification methods complete checkout before the money lands —
    // handing over downloads here would be giving away unpaid goods.
    expect(await fulfillSessionOnDemand("cs_unpaid")).toBe("unpaid");
    const rows = await db.query.orders.findMany({
      where: eq(orders.stripeSessionId, "cs_unpaid"),
    });
    expect(rows).toHaveLength(0);
    expect(emailSendStub).not.toHaveBeenCalled();
  });

  it("returns `error` instead of throwing when Stripe is unreachable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(stripe().checkout.sessions.retrieve).mockRejectedValueOnce(
      new Error("stripe timeout"),
    );

    // The page must still render its pending state — the customer has paid, and
    // Stripe's own webhook retries will land the order.
    expect(await fulfillSessionOnDemand("cs_stripe_down")).toBe("error");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
