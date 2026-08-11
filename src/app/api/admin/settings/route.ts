import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { siteSettings } from "@/db/schema";
import { verifyAdminSession } from "@/lib/admin-auth";
import { RELEASES_TAG } from "@/lib/cache-tags";
import { CATALOG_DISCOUNT_KEY } from "@/lib/constants";
import { FAQ_SETTING_KEY } from "@/lib/faq-defaults";
import { FaqContentSchema } from "@/lib/faq-schema";

type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Keys whose value feeds a `RELEASES_TAG`-cached read. Without this the
 * catalog discount could take up to an hour (the ISR window on `/music`) to
 * reach the storefront.
 */
const RELEASE_TAGGED_KEYS = new Set([CATALOG_DISCOUNT_KEY]);

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

  const [setting] = await db
    .insert(siteSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value },
    })
    .returning();

  if (RELEASE_TAGGED_KEYS.has(key)) {
    revalidateTag(RELEASES_TAG, "max");
  }

  return NextResponse.json(setting);
}
