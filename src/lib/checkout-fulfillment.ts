import { after } from "next/server";
import {
  fulfillCheckoutSession,
  sendPurchaseConfirmation,
  type FulfillSessionResult,
  type PurchaseConfirmationDeps,
} from "@gigamusic/checkout";
import { SITE_ALIAS } from "@/lib/constants";
import { queries } from "@/lib/db";
import { EMAIL_BRANDING, emailProvider } from "@/lib/email";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/utils";

/**
 * Everything the purchase-confirmation email needs, shared by both paths that
 * can record an order — the Stripe webhook and the success page's on-demand
 * fulfillment — so the customer gets the same email whichever one gets there
 * first.
 *
 * Magic-link verification reads `email` only; the gigamusic signer includes
 * `orderId` too, which our verify route ignores. ADMIN_SECRET continues to back
 * the order-token signature so existing tokens stay valid.
 */
export function purchaseConfirmationDeps(): PurchaseConfirmationDeps {
  return {
    email: emailProvider(),
    branding: EMAIL_BRANDING,
    emailFrom: env.EMAIL_FROM(),
    baseUrl: getBaseUrl(),
    orderTokenSecret: env.ADMIN_SECRET(),
  };
}

/**
 * Flattened outcome — the package's skip `reason`s are lifted alongside the
 * other statuses so the page can branch on a single tag. Derived from
 * `FulfillSessionResult` so a new reason upstream surfaces here as a type error
 * rather than a silently unhandled case.
 */
export type OnDemandFulfillment =
  | Exclude<FulfillSessionResult["status"], "skipped">
  | Extract<FulfillSessionResult, { status: "skipped" }>["reason"]
  | "error";

/**
 * Record the order for a completed Stripe session right now, instead of waiting
 * for the webhook to deliver.
 *
 * Stripe redirects the buyer to the success page and POSTs the webhook in
 * parallel — nothing sequences the two, so the order is regularly not on disk
 * yet when the page renders. This is the same idempotent write the webhook
 * performs: whichever path gets there first records the order and mails the
 * confirmation, and the loser sees `already-recorded` and does nothing, so the
 * customer is emailed exactly once.
 *
 * Never throws. A Stripe outage or a failed write leaves the page in its
 * pending state and the webhook (which Stripe retries for days) still lands the
 * order — far better than a 500 on a page the customer has already paid for.
 */
export async function fulfillSessionOnDemand(
  sessionId: string,
): Promise<OnDemandFulfillment> {
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const result = await fulfillCheckoutSession(session, {
      queries,
      site: SITE_ALIAS,
    });

    if (result.status === "created") {
      after(() =>
        sendPurchaseConfirmation(
          {
            orderId: result.order.id,
            customerEmail: result.customerEmail,
            itemNames: result.itemNames,
            totalCents: result.totalCents,
          },
          purchaseConfirmationDeps(),
        ),
      );
    }

    return result.status === "skipped" ? result.reason : result.status;
  } catch (err) {
    console.error(
      `[checkout-success] on-demand fulfillment failed for session ${sessionId}:`,
      err,
    );
    return "error";
  }
}
