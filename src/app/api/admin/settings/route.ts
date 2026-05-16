import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { FAQ_SETTING_KEY } from "@/lib/faq-defaults";
import { FaqContentSchema } from "@/lib/faq-schema";

type ValidationResult = { ok: true } | { ok: false; error: string };

/** Per-key validators run before persisting site settings. Keys not listed here accept any string. */
const VALIDATORS: Record<string, (raw: string) => ValidationResult> = {
  [FAQ_SETTING_KEY]: (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Value must be valid JSON" };
    }
    const result = FaqContentSchema.safeParse(parsed);
    return result.success ? { ok: true } : { ok: false, error: result.error.message };
  },
};

export async function PUT(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key, value } = (await req.json()) as { key: string; value: string };

  const validator = VALIDATORS[key];
  if (validator) {
    const result = validator(value);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }

  const setting = await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  return NextResponse.json(setting);
}
