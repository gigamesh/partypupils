import { cookies } from "next/headers";
import { signSessionToken, verifySessionToken } from "@gigamusic/core";
import { env } from "./env";

const COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24;

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

// Stateless variant for `src/proxy.ts` (Next 16 middleware), where
// `next/headers.cookies()` isn't available — reads the cookie off the
// request's `Cookie` header directly.
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
