/**
 * Admin login route — owns the auth decision and mints the session cookie.
 *
 * `@gigamusic/admin` stopped shipping a login handler in 0.2.0; consumers
 * roll their own. We:
 *   1. Rate-limit per IP via `@gigamusic/db`'s `consumeRateLimit` query
 *      (10 attempts / 15 min, key prefix `admin-login:<ip>`).
 *   2. Verify the supplied password against `ADMIN_PASSWORD_HASH`
 *      (bcrypt) using `@gigamusic/core.verifyPassword`.
 *   3. On success, write the httpOnly admin session cookie via
 *      `@/lib/admin-auth.createAdminSession`.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@gigamusic/core";
import { createAdminSession } from "@/lib/admin-auth";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";
import { env } from "@/lib/env";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await consumeRateLimit(
    `admin-login:${ip}`,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let password: string | undefined;
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  if (!password) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH());
  if (!ok) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
