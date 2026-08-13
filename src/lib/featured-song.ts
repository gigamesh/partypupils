import { unstable_cache } from "next/cache";
import { queries } from "./db";
import { RELEASES_TAG } from "./cache-tags";
import { FEATURED_SONG_KEY } from "./constants";
import type { SearchableTrack } from "./track-search";

/**
 * The track id the admin has picked as the featured song, or null when none is
 * set. Tagged on `RELEASES_TAG` so saving the setting invalidates `/music`
 * immediately instead of waiting out its ISR window — the settings route adds
 * this key to its release-tagged set for exactly that reason.
 *
 * `getSetting` JSON-parses on the way out, so a stored `"42"` arrives as a
 * number and the "none" sentinel (an empty string, which `JSON.parse` rejects)
 * falls through to the raw string. Both shapes, plus any leftover garbage,
 * resolve to null rather than throwing — a bad row should hide the card, not
 * break the page.
 */
export const getFeaturedSongTrackId = unstable_cache(
  async (): Promise<number | null> => {
    const raw = await queries.getSetting<string | number>(FEATURED_SONG_KEY);
    if (raw === null) return null;
    const value = typeof raw === "number" ? raw : parseInt(raw, 10);
    return Number.isInteger(value) ? value : null;
  },
  ["featured-song-track-id-v1"],
  { tags: [RELEASES_TAG], revalidate: 3600 },
);

/**
 * Resolve the featured track id against the published catalog. Returns null
 * when nothing is featured, or when the chosen song has since been deleted or
 * had its release unpublished — admins do both without revisiting settings,
 * and neither should leave a broken card on `/music`.
 *
 * Reads out of the search index the page already builds, so featuring a song
 * costs no extra query and the card can never disagree with the catalog below
 * it.
 */
export function findFeaturedSong(
  index: SearchableTrack[],
  trackId: number | null,
): SearchableTrack | null {
  if (trackId === null) return null;
  return index.find((entry) => entry.track.id === trackId) ?? null;
}
