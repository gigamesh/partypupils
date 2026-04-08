import { NextRequest, NextResponse } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string };

  if (password !== env.ADMIN_PASSWORD()) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
