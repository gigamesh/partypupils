import type { PlayerTrack } from "./player-types";
import { toPlayerTrack } from "./player-data";
import type { TrackRowRelease, TrackRowTrack } from "@/components/TrackRow";

/**
 * A single searchable song, flattened out of the release catalog. The whole
 * index ships to the browser with `/music`, so it carries only what the search
 * matches on plus what `TrackRow` needs to render a result.
 */
export interface SearchableTrack {
  track: TrackRowTrack;
  release: TrackRowRelease;
  playerTrack: PlayerTrack | null;
  /** Pre-normalised haystack: track name, artist and release name. */
  haystack: string;
}

interface IndexableTrack extends TrackRowTrack {
  artist: string | null;
  files: { format: string; storageKey: string }[];
}

interface IndexableRelease extends TrackRowRelease {
  tracks: IndexableTrack[];
}

/** Lowercase, strip diacritics, and collapse punctuation/whitespace to single spaces. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Flatten the published catalog into one searchable entry per track. */
export function buildTrackSearchIndex(releases: IndexableRelease[]): SearchableTrack[] {
  return releases.flatMap((release) => {
    const releaseInfo: TrackRowRelease = {
      id: release.id,
      name: release.name,
      slug: release.slug,
      coverImageUrl: release.coverImageUrl,
    };
    return release.tracks.map((track) => ({
      track: {
        id: track.id,
        name: track.name,
        slug: track.slug,
        price: track.price,
        trackNumber: track.trackNumber,
      },
      release: releaseInfo,
      playerTrack: toPlayerTrack(track, releaseInfo),
      haystack: normalise([track.name, track.artist ?? "", release.name].join(" ")),
    }));
  });
}

/**
 * Match every whitespace-separated term in `query` against a track's name,
 * artist and release name, in any order. Results are ranked by where the first
 * term lands: a track-name prefix beats a mid-name hit, which beats a match
 * that only came from the release name.
 */
export function searchTracks(index: SearchableTrack[], query: string): SearchableTrack[] {
  const terms = normalise(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { entry: SearchableTrack; score: number }[] = [];
  for (const entry of index) {
    if (!terms.every((term) => entry.haystack.includes(term))) continue;
    const name = normalise(entry.track.name);
    const position = name.indexOf(terms[0]);
    scored.push({ entry, score: position === 0 ? 0 : position > 0 ? 1 : 2 });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.track.name.localeCompare(b.entry.track.name))
    .map((s) => s.entry);
}
