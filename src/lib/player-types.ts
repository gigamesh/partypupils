export type RepeatMode = "off" | "one" | "all";

export type QueueSource = "radio" | "release" | "track" | null;

export interface PlayerTrack {
  trackId: number;
  trackName: string;
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
};

export interface PersistedPlayerState {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTime: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queueSource: QueueSource;
}
