import { cookies } from "next/headers";
import { signSessionToken, verifySessionToken } from "@gigamusic/core";
import { env } from "./env";

export const ADMIN_SESSION_COOKIE = "admin_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24;
// Sliding window: once a token is inside its last 12 hours, `src/proxy.ts`
// reissues it on the next admin request. Without this the session hard-expires
// 24h after login, and a long-lived admin tab (a release draft left open
// overnight) only discovers it when the first upload of a save 401s.
const REFRESH_WHEN_REMAINING_SECONDS = 60 * 60 * 12;

/** Cookie attributes shared by every write of the admin session cookie. */
export const adminSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: SESSION_DURATION_SECONDS,
  path: "/",
} as const;

type AdminSessionPayload = { admin?: unknown; exp?: number };

function signSession(): Promise<string> {
  return signSessionToken({
    payload: { admin: true },
    secret: env.ADMIN_SECRET(),
    expiresIn: `${SESSION_DURATION_SECONDS}s`,
  });
}

/** Verify a raw token, returning its payload or null when absent/invalid/expired. */
async function readSession(
  token: string | null | undefined,
): Promise<AdminSessionPayload | null> {
  if (!token) return null;
  try {
    const payload = await verifySessionToken<AdminSessionPayload>(
      token,
      env.ADMIN_SECRET(),
    );
    return payload.admin === true ? payload : null;
  } catch {
    return null;
  }
}

/** True when a valid token is close enough to expiry to be worth reissuing. */
function needsRefresh(payload: AdminSessionPayload): boolean {
  // No `exp` claim means a non-expiring legacy token — reissue to get it onto
  // the current 24h-with-refresh scheme.
  if (typeof payload.exp !== "number") return true;
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  return remaining < REFRESH_WHEN_REMAINING_SECONDS;
}

export async function createAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, await signSession(), adminSessionCookieOptions);
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, "", {
    ...adminSessionCookieOptions,
    maxAge: 0,
  });
}

export async function verifyAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return (await readSession(jar.get(ADMIN_SESSION_COOKIE)?.value)) !== null;
}

export type AdminSessionCheck =
  | { authed: false }
  | { authed: true; refreshedToken: string | null };

// Stateless variant for `src/proxy.ts` (Next 16 middleware), where
// `next/headers.cookies()` isn't available — reads the cookie off the
// request's `Cookie` header directly. Returns a replacement token when the
// session is inside its refresh window; the proxy owns writing it back,
// since that's the one place that can set cookies on every admin request
// (`cookies()` is read-only during a Server Component render).
export async function verifyAdminSessionFromRequest(
  req: Request,
): Promise<AdminSessionCheck> {
  const header = req.headers.get("cookie");
  const payload = header
    ? await readSession(parseCookieHeader(header, ADMIN_SESSION_COOKIE))
    : null;
  if (!payload) return { authed: false };
  return {
    authed: true,
    refreshedToken: needsRefresh(payload) ? await signSession() : null,
  };
}

function parseCookieHeader(header: string, name: string): string | null {
  for (const raw of header.split(";")) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}
