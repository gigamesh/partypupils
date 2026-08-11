import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, queries } from "@/lib/db";
import { releases } from "@/db/schema";
import { verifyAdminSession } from "@/lib/admin-auth";
import { RELEASES_TAG } from "@/lib/cache-tags";
import { BUNDLES_SETTING_KEY } from "@/lib/constants";
import { BundlesConfigSchema } from "@/lib/bundle-schema";
import { getBundlesConfig, getPublishedBundles } from "@/lib/bundles";

/**
 * Bundles get their own route rather than riding `PUT /api/admin/settings`
 * because that route's validator contract is synchronous, and checking that
 * every member id refers to a published release needs a DB round-trip.
 */

/** Published releases in the shape the bundle editor's picker needs. */
async function listPickerReleases() {
  return db
    .select({
      id: releases.id,
      name: releases.name,
      slug: releases.slug,
      price: releases.price,
      coverImageUrl: releases.coverImageUrl,
    })
    .from(releases)
    .where(eq(releases.isPublished, true))
    .orderBy(releases.name);
}

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config, pickerReleases] = await Promise.all([
    getBundlesConfig(),
    listPickerReleases(),
  ]);

  return NextResponse.json({ config, releases: pickerReleases });
}

export async function PUT(req: NextRequest) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BundlesConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // The storefront silently drops unresolvable members at read time, which is
  // right for a release unpublished after the fact — but saving a bundle that
  // already points at one is an authoring mistake worth surfacing.
  const publishedIds = new Set((await listPickerReleases()).map((r) => r.id));
  const unknownIds = [
    ...new Set(
      parsed.data.bundles.flatMap((b) => b.releaseIds.filter((id) => !publishedIds.has(id))),
    ),
  ];
  if (unknownIds.length > 0) {
    return NextResponse.json(
      {
        error: `Bundles reference releases that are not published: ${unknownIds.join(", ")}`,
        unknownIds,
      },
      { status: 400 },
    );
  }

  await queries.setSetting(BUNDLES_SETTING_KEY, parsed.data);
  revalidateTag(RELEASES_TAG, "max");

  return NextResponse.json({
    config: parsed.data,
    bundles: await getPublishedBundles(),
  });
}
