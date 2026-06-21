import { unstable_cache } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
import { toPlayerTrack } from "@/lib/player-data";
import type { PlayerTrack } from "@/lib/player-types";
import { NextResponse } from "next/server";
import { RADIO_TRACKS_TAG } from "@/lib/cache-tags";

/**
 * Build the un-shuffled radio queue. Cached and tagged so admin writes
 * (`/api/admin/releases/*`) can invalidate via revalidateTag(RADIO_TRACKS_TAG).
 * Callers shuffle client-side so each listener gets their own ordering.
 */
const getRadioTracks = unstable_cache(
  async (): Promise<PlayerTrack[]> => {
    const releaseRows = await db.query.releases.findMany({
      where: and(eq(releases.isPublished, true), eq(releases.inRadio, true)),
      with: {
        tracks: {
          where: (t, { eq: eqFn }) => eqFn(t.inRadio, true),
          orderBy: (t, { asc }) => asc(t.trackNumber),
          with: { files: true },
        },
      },
    });

    return releaseRows.flatMap((r) => {
      const releaseInfo = {
        id: r.id,
        name: r.name,
        slug: r.slug,
        coverImageUrl: r.coverImageUrl,
      };
      return r.tracks
        .map((t) => toPlayerTrack(t, releaseInfo))
        .filter((t): t is NonNullable<typeof t> => t !== null);
    });
  },
  ["radio-tracks-v1"],
  { tags: [RADIO_TRACKS_TAG], revalidate: 3600 },
);

// Cache the response (same payload for everyone — shuffling is client-side) so
// the CDN serves it without invoking the function or touching Postgres.
// `RandomMixSeeder` fires this on every fresh/bot visit, so per-request
// rendering meant a continuous catalog read that kept Neon's compute awake.
// Admin writes call revalidateTag(RADIO_TRACKS_TAG) to refresh on demand.
export const revalidate = 3600;

export async function GET() {
  const tracks = await getRadioTracks();
  return NextResponse.json(
    { tracks },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
