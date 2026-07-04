import type { PlayerTrack, RepeatMode } from "./player-types";

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

/** Cap on retained history so a long radio session can't grow state unbounded. */
export const HISTORY_LIMIT = 100;

/** The three-part play timeline: already-played, current, and materialized future. */
export interface MaterializedQueue {
  history: PlayerTrack[];
  current: PlayerTrack | null;
  upNext: PlayerTrack[];
}

/** Append to history, keeping only the most recent HISTORY_LIMIT entries. */
function pushHistory(history: PlayerTrack[], track: PlayerTrack): PlayerTrack[] {
  const next = [...history, track];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * Build one full cycle of upcoming tracks from `source`. In order mode this is
 * the source in its natural order. In shuffle mode it is a fresh Fisher-Yates
 * permutation of the whole source — so every track plays exactly once per cycle
 * — with the first entry swapped away from `current` to avoid a back-to-back
 * repeat across the cycle wrap.
 */
function buildCycle(source: PlayerTrack[], current: PlayerTrack | null, shuffle: boolean): PlayerTrack[] {
  if (!shuffle) return source.slice();
  const cycle = shufflePlayerTracks(source);
  if (cycle.length > 1 && current && cycle[0].trackId === current.trackId) {
    const swapWith = 1 + Math.floor(Math.random() * (cycle.length - 1));
    [cycle[0], cycle[swapWith]] = [cycle[swapWith], cycle[0]];
  }
  return cycle;
}

/**
 * Materialize the initial timeline for a freshly-loaded source. `current` is the
 * track at `startIndex`. In shuffle mode the remaining tracks are shuffled into
 * `upNext` (history starts empty). In order mode the tracks before/after
 * `startIndex` become history/up-next so back and forward walk the list.
 */
export function buildInitialQueue(
  source: PlayerTrack[],
  startIndex: number,
  shuffle: boolean,
): MaterializedQueue {
  if (source.length === 0) return { history: [], current: null, upNext: [] };
  const idx = Math.max(0, Math.min(startIndex, source.length - 1));
  const current = source[idx];
  if (shuffle) {
    const rest = source.filter((_, i) => i !== idx);
    return { history: [], current, upNext: shufflePlayerTracks(rest) };
  }
  return { history: source.slice(0, idx), current, upNext: source.slice(idx + 1) };
}

/**
 * Advance to the next track: shift the head of `upNext` into `current` and push
 * the old `current` onto history. When `upNext` is empty, start a new cycle from
 * `source` if `repeat === "all"`; otherwise return null to signal end-of-queue.
 */
export function advanceQueue(
  queue: MaterializedQueue & { source: PlayerTrack[] },
  shuffle: boolean,
  repeat: RepeatMode,
): MaterializedQueue | null {
  const { history, current, upNext, source } = queue;
  const nextHistory = current ? pushHistory(history, current) : history;
  const pool = upNext.length > 0 ? upNext : repeat === "all" ? buildCycle(source, current, shuffle) : [];
  if (pool.length === 0) return null;
  const [next, ...rest] = pool;
  return { history: nextHistory, current: next, upNext: rest };
}

/**
 * Step back to the previously-played track: pop the tail of `history` into
 * `current` and unshift the old `current` back onto `upNext`, so a later "next"
 * retraces the exact same track. Returns null when history is empty.
 */
export function retreatQueue(queue: MaterializedQueue): MaterializedQueue | null {
  const { history, current, upNext } = queue;
  if (history.length === 0) return null;
  return {
    history: history.slice(0, -1),
    current: history[history.length - 1],
    upNext: current ? [current, ...upNext] : upNext,
  };
}

/**
 * Reconcile the up-next queue against a refreshed `source`. The radio re-fetches
 * its catalog at song boundaries so admin `inRadio` changes reach live listeners:
 * tracks pulled from the catalog drop out of `upNext` immediately, while newly
 * added tracks enter at the next cycle wrap (when `buildCycle` reads the updated
 * source). `current` and `history` are left untouched.
 */
export function reconcileSource(
  upNext: PlayerTrack[],
  newSource: PlayerTrack[],
): { upNext: PlayerTrack[]; source: PlayerTrack[] } {
  const live = new Set(newSource.map((t) => t.trackId));
  return { upNext: upNext.filter((t) => live.has(t.trackId)), source: newSource };
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
