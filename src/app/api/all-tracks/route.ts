import { prisma } from "@/lib/db";
import { toPlayerTrack } from "@/lib/player-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Fisher-Yates shuffle. */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET() {
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

  const tracks = releases.flatMap((r) => {
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

  return NextResponse.json({ tracks: shuffle(tracks) });
}
