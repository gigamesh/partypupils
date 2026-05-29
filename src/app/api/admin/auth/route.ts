import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { checkBotId } from "botid/server";
import { createAdminSession } from "@/lib/admin-auth";
import { queries } from "@/lib/db";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/rate-limit";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const verification = await checkBotId();
  if (verification.isBot) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const ip = clientIp(req);
  const { ok: allowed } = await queries.consumeRateLimit(
    `admin-login:${ip}`,
    { max: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_WINDOW_MS },
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  const { password } = (await req.json()) as { password: string };

  if (!password || !safeEqual(password, env.ADMIN_PASSWORD())) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
