import type { PlayerTrack } from "./player-types";

interface TrackInput {
  id: number;
  name: string;
  slug: string;
  trackNumber: number;
  files: { format: string; storageKey: string }[];
}

interface ReleaseInput {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
}

/** Normalise a URL whose path may contain unencoded characters (e.g. literal spaces in R2 keys). */
function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = encodeURI(decodeURI(parsed.pathname));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Build a PlayerTrack from raw Prisma data. Returns null when no mp3 TrackFile exists. */
export function toPlayerTrack(track: TrackInput, release: ReleaseInput): PlayerTrack | null {
  const mp3 = track.files.find((f) => f.format === "mp3");
  if (!mp3) return null;
  return {
    trackId: track.id,
    trackName: track.name,
    trackSlug: track.slug,
    trackNumber: track.trackNumber,
    releaseId: release.id,
    releaseName: release.name,
    releaseSlug: release.slug,
    coverImageUrl: release.coverImageUrl ? normaliseUrl(release.coverImageUrl) : null,
    streamUrl: normaliseUrl(mp3.storageKey),
  };
}

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shufflePlayerTracks(tracks: PlayerTrack[]): PlayerTrack[] {
  const out = tracks.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Map a release-with-tracks (Prisma include shape) to its non-null PlayerTrack[]. */
export function buildPlayerTracksForRelease(
  release: ReleaseInput & { tracks: TrackInput[] },
): PlayerTrack[] {
  const releaseInfo = {
    id: release.id,
    name: release.name,
    slug: release.slug,
    coverImageUrl: release.coverImageUrl,
  };
  return release.tracks
    .map((t) => toPlayerTrack(t, releaseInfo))
    .filter((t): t is PlayerTrack => t !== null);
}
