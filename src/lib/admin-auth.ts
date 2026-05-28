/**
 * Thin façade over `@gigamusic/admin/server`'s session helpers — keeps every
 * party-pupils call site that does `await verifyAdminSession()` unchanged
 * after the bcrypt migration.
 *
 * `createAdminLoginHandler` mints the session cookie inside the package, so
 * party-pupils no longer ships its own `createAdminSession()` writer.
 */
import { isAdminAuthenticated } from "@gigamusic/admin/server";
import { env } from "./env";

/** Returns true if the current request's session cookie verifies. */
export function verifyAdminSession(): Promise<boolean> {
  return isAdminAuthenticated(env.ADMIN_SECRET());
}
