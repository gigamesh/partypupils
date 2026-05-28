/**
 * Local admin-auth implementation.
 *
 * `@gigamusic/*` no longer ships an admin auth flow as of 0.2.0 — auth is
 * the consumer's responsibility. This file is the canonical place we
 * decide who's authed and mint/verify the session cookie. The package's
 * admin handler factories trust that requests reaching them have already
 * been gated by `src/proxy.ts`.
 *
 * Session shape: an HS256-signed JWT (via `@gigamusic/core`) carrying
 * `{ admin: true }`. 24-hour expiry; httpOnly cookie. No sliding refresh
 * — admins re-log in once a day. The same `ADMIN_SECRET` env var that
 * already exists signs and verifies.
 */
import { cookies } from "next/headers";
import { signSessionToken, verifySessionToken } from "@gigamusic/core";
import { env } from "./env";

const COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24;

/** Mint a fresh session token and write the httpOnly cookie. */
export async function createAdminSession(): Promise<void> {
  const token = await signSessionToken({
    payload: { admin: true },
    secret: env.ADMIN_SECRET(),
    expiresIn: `${SESSION_DURATION_SECONDS}s`,
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

/** Clear the admin session cookie. */
export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Verify the admin session cookie in the current request scope. Returns
 * true iff the cookie carries a valid `{ admin: true }` token signed with
 * `ADMIN_SECRET`. Suitable for Server Components, route handlers, and
 * Server Actions — anywhere `next/headers.cookies()` works.
 */
export async function verifyAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const payload = await verifySessionToken<{ admin?: unknown }>(
      token,
      env.ADMIN_SECRET(),
    );
    return payload.admin === true;
  } catch {
    return false;
  }
}

/**
 * Stateless variant for use in `proxy.ts` (Next 16 middleware), where
 * `next/headers.cookies()` isn't available. Reads the cookie directly off
 * the request's `Cookie` header.
 */
export async function verifyAdminSessionFromRequest(
  req: Request,
): Promise<boolean> {
  const header = req.headers.get("cookie");
  if (!header) return false;
  const token = parseCookieHeader(header, COOKIE_NAME);
  if (!token) return false;
  try {
    const payload = await verifySessionToken<{ admin?: unknown }>(
      token,
      env.ADMIN_SECRET(),
    );
    return payload.admin === true;
  } catch {
    return false;
  }
}

function parseCookieHeader(header: string, name: string): string | null {
  for (const raw of header.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}
