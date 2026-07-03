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

export interface PlayerState {
  queue: PlayerTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queueSource: QueueSource;
  /** trackIds heard in the current shuffle cycle; drives no-repeat shuffle. */
  playedTrackIds: number[];
  /** Ordered trackIds in the exact order played; drives shuffle back/forward navigation. */
  history: number[];
  /** Pointer into `history` for the currently-playing track (-1 when nothing is loaded). */
  historyIndex: number;
}

export const EMPTY_PLAYER_STATE: PlayerState = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  shuffle: true,
  repeat: "all",
  queueSource: null,
  playedTrackIds: [],
  history: [],
  historyIndex: -1,
};

export interface PersistedPlayerState {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTime: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queueSource: QueueSource;
  playedTrackIds?: number[];
  history?: number[];
  historyIndex?: number;
}
