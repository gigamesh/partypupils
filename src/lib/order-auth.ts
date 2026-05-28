import { signOrderToken, verifyOrderToken } from "@gigamusic/core";
import { env } from "./env";

/**
 * Magic-link order-verification token. Party-pupils' order lookup is keyed by
 * email only (no order id), so we sign with an empty `orderId` placeholder.
 */
export async function createOrderVerificationToken(email: string): Promise<string> {
  return signOrderToken({
    orderId: "",
    email,
    secret: env.ADMIN_SECRET(),
    expiresIn: "1h",
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
