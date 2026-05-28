import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@gigamusic/core";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { env } from "./env";

const COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24;
const REFRESH_WHEN_REMAINING_SECONDS = 60 * 60 * 12;

function signSession() {
  return createAdminSessionToken({
    secret: env.ADMIN_SECRET(),
    expiresIn: `${SESSION_DURATION_SECONDS}s`,
  });
}

function writeSessionCookie(jar: ReadonlyRequestCookies, token: string) {
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function createAdminSession() {
  writeSessionCookie(await cookies(), await signSession());
}

/**
 * Verifies the admin session cookie. If the token is valid and within the
 * sliding-window refresh threshold, reissues a fresh token. The reissue
 * silently no-ops when called from a context that can't write cookies
 * (e.g. a Server Component render) — refresh happens on the next call from
 * a Route Handler or Server Action.
 */
export async function verifyAdminSession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await verifyAdminSessionToken(token, env.ADMIN_SECRET());
    // Decode unverified to read exp for sliding-window refresh; verify already
    // confirmed the signature and expiry.
    const [, payloadB64] = token.split(".");
    if (payloadB64) {
      try {
        const payload = JSON.parse(
          Buffer.from(payloadB64, "base64url").toString("utf8"),
        ) as { exp?: number };
        const exp = payload.exp ?? 0;
        const remaining = exp - Math.floor(Date.now() / 1000);
        if (remaining < REFRESH_WHEN_REMAINING_SECONDS) {
          try {
            writeSessionCookie(jar, await signSession());
          } catch {
            // cookies() is readonly in Server Component renders — skip refresh.
          }
        }
      } catch {
        // unreadable payload — skip refresh, the verify above already passed.
      }
    }
    return true;
  } catch {
    return false;
  }
}
