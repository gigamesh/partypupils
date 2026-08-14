import { eq } from "drizzle-orm";
import { db, queries } from "@/lib/db";
import { orders as ordersTable } from "@/db/schema";
import { sendDownloadReissueEmail } from "@/lib/email";
import {
  REISSUED_LINK_EXPIRY,
  REISSUED_LINK_EXPIRY_DAYS,
  createOrderVerificationToken,
} from "@/lib/order-auth";
import { getBaseUrl } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ReissueInput {
  orderId: number;
  /** Corrected address. Omit to reissue to the address already on the order. */
  email?: string;
  /** Must be `true` when `email` differs from the order's — see `reissueOrderDownloads`. */
  confirmEmailChange?: boolean;
  /** Defaults to true. `false` mints the link without mailing it. */
  sendEmail?: boolean;
}

export type ReissueResult =
  | { ok: false; code: "not-found" }
  | { ok: false; code: "not-completed"; status: string }
  | { ok: false; code: "invalid-email" }
  | {
      ok: false;
      code: "email-change-unconfirmed";
      currentEmail: string;
      requestedEmail: string;
    }
  | {
      ok: true;
      orderId: number;
      email: string;
      /** Set when the order's stored address was rewritten by this call. */
      previousEmail: string | null;
      downloadToken: string;
      verifyUrl: string;
      /** How many download tokens the order already had; all of them still work. */
      existingTokenCount: number;
      itemNames: string[];
      totalCents: number;
      emailSent: boolean;
      /** Provider error text when `emailSent` is false but the link was still minted. */
      emailError: string | null;
      linkExpiresInDays: number;
    };

/** Human-readable line items, matching the wording of the purchase email. */
function itemNamesFor(order: {
  items: {
    release?: { name: string } | null;
    track?: ({ name: string } & { release?: { name: string } | null }) | null;
  }[];
}): string[] {
  return order.items
    .map((item) => {
      if (item.release) return item.release.name;
      if (item.track) {
        return item.track.release
          ? `${item.track.release.name} — ${item.track.name}`
          : item.track.name;
      }
      return null;
    })
    .filter((name): name is string => name !== null);
}

/**
 * Make a customer whole after a failed download: mint a fresh download token for
 * the order and hand back a magic link to their downloads, optionally mailing it.
 *
 * ### Why a new token instead of reusing the old one
 *
 * `download_tokens` rows carry no expiry and no revocation column, so the old
 * token keeps working — deleting it is the only way to invalidate it, and doing
 * that mid-support-conversation would break the very link the customer is
 * sitting on. A reissue is therefore additive: the newest token is what
 * `/orders/verify` shows (it orders newest-first), and prior links stay valid.
 *
 * ### Why a corrected address rewrites the order
 *
 * Customers mistype at checkout, and `/orders/verify` resolves a magic link by
 * looking up orders whose `email` matches the token's. Signing a token for a
 * corrected address without also correcting the order row would produce a link
 * that resolves to zero orders. So an address change is a real write, and it is
 * gated twice: the caller must be an authenticated admin, and must pass
 * `confirmEmailChange: true` alongside the new address. Anything else comes back
 * as `email-change-unconfirmed` so the UI can force a deliberate second step.
 *
 * Never throws on mail-provider failure — the token is already minted and the
 * link is the useful half of the response, so a send failure is reported as
 * `emailSent: false` rather than losing the link.
 */
export async function reissueOrderDownloads(
  input: ReissueInput,
): Promise<ReissueResult> {
  const order = await queries.getOrderById(input.orderId);
  if (!order) return { ok: false, code: "not-found" };
  if (order.status !== "completed") {
    return { ok: false, code: "not-completed", status: order.status };
  }

  const requested = input.email?.trim();
  let previousEmail: string | null = null;
  let targetEmail = order.email;

  if (requested !== undefined && requested !== "") {
    if (!EMAIL_PATTERN.test(requested)) {
      return { ok: false, code: "invalid-email" };
    }
    if (requested.toLowerCase() !== order.email.trim().toLowerCase()) {
      if (input.confirmEmailChange !== true) {
        return {
          ok: false,
          code: "email-change-unconfirmed",
          currentEmail: order.email,
          requestedEmail: requested,
        };
      }
      await db
        .update(ordersTable)
        .set({ email: requested })
        .where(eq(ordersTable.id, order.id));
      previousEmail = order.email;
      targetEmail = requested;
    }
  }

  const existingTokenCount = order.downloadTokens?.length ?? 0;
  const created = await queries.createDownloadToken(order.id);

  const verifyToken = await createOrderVerificationToken(
    targetEmail,
    REISSUED_LINK_EXPIRY,
  );
  const verifyUrl = `${getBaseUrl()}/orders/verify?token=${verifyToken}`;

  const itemNames = itemNamesFor(order);
  let emailSent = false;
  let emailError: string | null = null;

  if (input.sendEmail !== false) {
    try {
      await sendDownloadReissueEmail({
        to: targetEmail,
        verifyUrl,
        itemNames,
        totalCents: order.amountTotal,
        expiryDays: REISSUED_LINK_EXPIRY_DAYS,
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Unknown email error";
      console.error(
        `[order-reissue] failed to email order ${order.id} link to ${targetEmail}:`,
        err,
      );
    }
  }

  return {
    ok: true,
    orderId: order.id,
    email: targetEmail,
    previousEmail,
    downloadToken: created.token,
    verifyUrl,
    existingTokenCount,
    itemNames,
    totalCents: order.amountTotal,
    emailSent,
    emailError,
    linkExpiresInDays: REISSUED_LINK_EXPIRY_DAYS,
  };
}
