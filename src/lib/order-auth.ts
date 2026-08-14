import { signOrderToken, verifyOrderToken } from "@gigamusic/core";
import { env } from "./env";

/**
 * Lifetime of a magic link an admin reissues from the orders view. Longer than
 * the 1h self-serve link (a support conversation can take days to resolve, and
 * the admin may paste the URL into a ticket), but deliberately not the
 * never-expires lifetime of the original purchase-confirmation link — a link
 * handed out by a human should stop working eventually.
 */
export const REISSUED_LINK_EXPIRY = "30d";

/** Days in `REISSUED_LINK_EXPIRY`, for UI copy. */
export const REISSUED_LINK_EXPIRY_DAYS = 30;

/**
 * Magic-link order-verification token. Party-pupils' order lookup is keyed by
 * email only (no order id), so we sign with an empty `orderId` placeholder.
 */
export async function createOrderVerificationToken(
  email: string,
  expiresIn: string | null = "1h",
): Promise<string> {
  return signOrderToken({
    orderId: "",
    email,
    secret: env.ADMIN_SECRET(),
    expiresIn,
  });
}

export async function verifyOrderVerificationToken(token: string): Promise<string | null> {
  try {
    const { email } = await verifyOrderToken(token, env.ADMIN_SECRET());
    return email || null;
  } catch {
    return null;
  }
}
