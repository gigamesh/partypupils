export type RepeatMode = "off" | "one" | "all";

export type QueueSource = "radio" | "release" | "track" | null;

export interface PlayerTrack {
  trackId: number;
  trackName: string;
  trackSlug: string;
  trackNumber: number;
  releaseId: number;
  releaseName: string;
  releaseSlug: string;
  coverImageUrl: string | null;
  streamUrl: string;
}

/**
 * The player models playback as a single timeline: `history` (already played,
 * oldest→newest), `current`, and `upNext` (materialized future). "Next"/"prev"
 * shift tracks between these three, so forward and back are always reversible.
 * `source` is the pool `upNext` is regenerated from on a cycle wrap or a radio
 * catalog refresh; it never itself drives the play order.
 */
export interface PlayerState {
  history: PlayerTrack[];
  current: PlayerTrack | null;
  upNext: PlayerTrack[];
  source: PlayerTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queueSource: QueueSource;
}

export const EMPTY_PLAYER_STATE: PlayerState = {
  history: [],
  current: null,
  upNext: [],
  source: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  shuffle: true,
  repeat: "all",
  queueSource: null,
};

export interface PersistedPlayerState {
  history: PlayerTrack[];
  current: PlayerTrack | null;
  upNext: PlayerTrack[];
  source: PlayerTrack[];
  currentTime: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queueSource: QueueSource;
}
