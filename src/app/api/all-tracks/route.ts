import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
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
    const releases = await prisma.release.findMany({
      where: { isPublished: true, inRadio: true },
      include: {
        tracks: {
          where: { inRadio: true },
          orderBy: { trackNumber: "asc" },
          include: { files: true },
        },
      },
    });

    return releases.flatMap((r) => {
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

export async function GET() {
  const tracks = await getRadioTracks();
  return NextResponse.json({ tracks });
}
