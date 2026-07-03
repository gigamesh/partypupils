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

/**
 * "Shuffle bag" picker: choose the next track to play in shuffle mode without
 * repeating any track until every other track has played. `playedTrackIds` is
 * the set of trackIds already heard in the current cycle (including the one
 * playing now). Keying on trackId — not queue index — keeps the bag correct
 * even when the queue array is re-fetched/re-shuffled mid-cycle (radio refresh).
 *
 * Returns the chosen queue index and the updated played set, or null for an
 * empty queue. When the bag is exhausted a fresh cycle begins, excluding the
 * just-played `currentTrackId` so a track never repeats across the wrap.
 */
export function pickNextShuffleTrack(
  queue: PlayerTrack[],
  playedTrackIds: number[],
  currentTrackId: number | null,
): { index: number; playedTrackIds: number[] } | null {
  if (queue.length === 0) return null;
  if (queue.length === 1) return { index: 0, playedTrackIds: [queue[0].trackId] };

  const played = new Set(playedTrackIds);
  const unplayed = queue
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => !played.has(track.trackId));

  if (unplayed.length > 0) {
    const pick = unplayed[Math.floor(Math.random() * unplayed.length)];
    return { index: pick.index, playedTrackIds: [...playedTrackIds, pick.track.trackId] };
  }

  // Bag exhausted → start a new cycle, avoiding an immediate repeat of the
  // track that just finished.
  const fresh = queue
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.trackId !== currentTrackId);
  const candidates = fresh.length > 0 ? fresh : queue.map((track, index) => ({ track, index }));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { index: pick.index, playedTrackIds: [pick.track.trackId] };
}

/**
 * Resolve the next track in shuffle mode using a play-history stack. When the
 * listener has navigated backward (`historyIndex` sits before the tip), "next"
 * retraces the recorded order so forward/back are reversible — it does NOT draw
 * a fresh random track until the pointer reaches the tip of `history`. Only at
 * the tip does it consult the shuffle bag via `pickNextShuffleTrack`, appending
 * the chosen trackId to history. History entries whose track is no longer in the
 * queue (e.g. pulled from the radio) are skipped.
 *
 * Returns the chosen queue index plus the updated history, pointer, and bag, or
 * null for an empty queue.
 */
export function resolveShuffleNext(
  queue: PlayerTrack[],
  history: number[],
  historyIndex: number,
  playedTrackIds: number[],
  currentTrackId: number | null,
): { index: number; history: number[]; historyIndex: number; playedTrackIds: number[] } | null {
  if (queue.length === 0) return null;

  // Retrace forward through recorded history when the pointer is behind the tip.
  for (let i = historyIndex + 1; i < history.length; i++) {
    const idx = queue.findIndex((t) => t.trackId === history[i]);
    if (idx >= 0) return { index: idx, history, historyIndex: i, playedTrackIds };
  }

  // At the tip: draw a fresh track from the shuffle bag and extend history,
  // trimming any stale forward entries that could not be found in the queue.
  const pick = pickNextShuffleTrack(queue, playedTrackIds, currentTrackId);
  if (!pick) return null;
  const trimmed = history.slice(0, historyIndex + 1);
  return {
    index: pick.index,
    history: [...trimmed, queue[pick.index].trackId],
    historyIndex: trimmed.length,
    playedTrackIds: pick.playedTrackIds,
  };
}

/**
 * Resolve the previous track in shuffle mode by walking the play-history stack
 * backward, skipping entries whose track has left the queue. Returns the chosen
 * queue index and the new pointer, or null when there is no earlier track to
 * return to (the caller then restarts the current track).
 */
export function resolveShufflePrev(
  queue: PlayerTrack[],
  history: number[],
  historyIndex: number,
): { index: number; historyIndex: number } | null {
  for (let i = historyIndex - 1; i >= 0; i--) {
    const idx = queue.findIndex((t) => t.trackId === history[i]);
    if (idx >= 0) return { index: idx, historyIndex: i };
  }
  return null;
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
