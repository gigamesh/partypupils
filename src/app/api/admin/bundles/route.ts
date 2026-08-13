import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { queries } from "@/lib/db";
import { verifyAdminSession } from "@/lib/admin-auth";
import { RELEASES_TAG } from "@/lib/cache-tags";
import { BUNDLES_SETTING_KEY } from "@/lib/constants";
import { BundlesConfigSchema } from "@/lib/bundle-schema";
import {
  getBundlesConfig,
  getPublishedBundles,
  listPickerReleases,
  listPickerTracks,
} from "@/lib/bundles";

/**
 * Bundles get their own route rather than riding `PUT /api/admin/settings`
 * because that route's validator contract is synchronous, and checking that
 * every member id refers to a published release or song needs a DB round-trip.
 */

export async function GET() {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config, pickerReleases, pickerTracks] = await Promise.all([
    getBundlesConfig(),
    listPickerReleases(),
    listPickerTracks(),
  ]);

  return NextResponse.json({
    config,
    releases: pickerReleases,
    tracks: pickerTracks,
  });
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
  const [pickerReleases, pickerTracks] = await Promise.all([
    listPickerReleases(),
    listPickerTracks(),
  ]);
  const publishedReleaseIds = new Set(pickerReleases.map((r) => r.id));
  const publishedTrackIds = new Set(pickerTracks.map((t) => t.id));

  const unknownIds = [
    ...new Set(
      parsed.data.bundles.flatMap((b) =>
        b.kind === "tracks"
          ? b.trackIds.filter((id) => !publishedTrackIds.has(id))
          : b.releaseIds.filter((id) => !publishedReleaseIds.has(id)),
      ),
    ),
  ];
  if (unknownIds.length > 0) {
    return NextResponse.json(
      {
        error: `Bundles reference releases or songs that are not published: ${unknownIds.join(", ")}`,
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
