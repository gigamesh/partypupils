"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  EMPTY_PLAYER_STATE,
  type PersistedPlayerState,
  type PlayerState,
  type PlayerTrack,
  type QueueSource,
  type RepeatMode,
} from "@/lib/player-types";

const STORAGE_KEY = "party-pupils-player";

let state: PlayerState = EMPTY_PLAYER_STATE;
let listeners: (() => void)[] = [];
let audioEl: HTMLAudioElement | null = null;
let prefetchEl: HTMLAudioElement | null = null;
let lastPrefetchedUrl: string | null = null;
let rafHandle: number | null = null;
let initialized = false;

function loadPersisted(): PersistedPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlayerState;
    if (!Array.isArray(parsed.queue) || typeof parsed.currentIndex !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(s: PlayerState) {
  if (typeof window === "undefined") return;
  const toSave: PersistedPlayerState = {
    queue: s.queue,
    currentIndex: s.currentIndex,
    currentTime: s.currentTime,
    shuffle: s.shuffle,
    repeat: s.repeat,
    queueSource: s.queueSource,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

let lastPersistAt = 0;

function emit(next: PlayerState, opts: { persist?: "always" | "throttled" | "skip" } = { persist: "always" }) {
  state = next;
  const mode = opts.persist ?? "always";
  if (mode === "always") {
    persist(state);
  } else if (mode === "throttled") {
    const now = Date.now();
    if (now - lastPersistAt > 1000) {
      lastPersistAt = now;
      persist(state);
    }
  }
  for (const l of listeners) l();
}

function getSnapshot(): PlayerState {
  return state;
}

function getServerSnapshot(): PlayerState {
  return EMPTY_PLAYER_STATE;
}

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "metadata";
  audioEl.addEventListener("loadedmetadata", () => {
    if (!audioEl) return;
    emit({ ...state, duration: audioEl.duration || 0 }, { persist: "skip" });
    syncMediaSessionPosition();
  });
  audioEl.addEventListener("ended", async () => {
    if (state.repeat === "one") {
      seekImpl(0);
      audioEl?.play().catch(() => {});
    } else {
      await maybeRefreshRadioQueue();
      nextImpl(true);
    }
  });
  audioEl.addEventListener("error", (e) => {
    console.error("Audio error", e);
  });
  return audioEl;
}

function startTimeUpdates() {
  stopTimeUpdates();
  const tick = () => {
    if (!audioEl || !state.isPlaying) {
      rafHandle = null;
      return;
    }
    const ct = audioEl.currentTime;
    const dur = audioEl.duration || state.duration;
    emit({ ...state, currentTime: ct, duration: dur }, { persist: "throttled" });
    maybePrefetch();
    rafHandle = requestAnimationFrame(tick);
  };
  rafHandle = requestAnimationFrame(tick);
}

function stopTimeUpdates() {
  if (rafHandle != null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

function maybePrefetch() {
  const next = nextTrackInQueue();
  if (!next) return;
  if (state.duration <= 0) return;
  if (state.currentTime / state.duration < 0.8) return;
  if (lastPrefetchedUrl === next.streamUrl) return;
  lastPrefetchedUrl = next.streamUrl;
  if (prefetchEl) prefetchEl.src = "";
  prefetchEl = new Audio();
  prefetchEl.preload = "auto";
  prefetchEl.src = next.streamUrl;
  prefetchEl.load();
}

function nextTrackInQueue(): PlayerTrack | null {
  const i = state.currentIndex;
  if (i < 0 || state.queue.length === 0) return null;
  if (state.shuffle) {
    if (state.queue.length <= 1) return null;
    return state.queue[Math.floor(Math.random() * state.queue.length)];
  }
  if (i + 1 < state.queue.length) return state.queue[i + 1];
  if (state.repeat === "all") return state.queue[0] ?? null;
  return null;
}

function loadTrackAt(index: number, autoplay: boolean) {
  if (index < 0 || index >= state.queue.length) return;
  const audio = ensureAudio();
  const track = state.queue[index];
  audio.src = track.streamUrl;
  audio.load();
  emit({
    ...state,
    currentIndex: index,
    currentTime: 0,
    duration: 0,
    isPlaying: autoplay,
  });
  setMediaSessionMetadata(track);
  if (autoplay) {
    audio.play().catch((e) => {
      console.warn("Autoplay blocked", e);
      emit({ ...state, isPlaying: false });
    });
    startTimeUpdates();
  }
  lastPrefetchedUrl = null;
}

/**
 * When the queue source is the radio, refresh `state.queue` from /api/all-tracks
 * before picking the next track. This lets admin `inRadio` toggles propagate to
 * already-listening visitors at song boundaries — the currently-playing track
 * finishes, then the next pick comes from the fresh list. Silent no-op on
 * network failure or empty result; non-radio queues are left untouched.
 */
async function maybeRefreshRadioQueue() {
  if (state.queueSource !== "radio") return;
  try {
    const r = await fetch("/api/all-tracks", { cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as { tracks: PlayerTrack[] };
    if (!Array.isArray(data.tracks) || data.tracks.length === 0) return;
    state = { ...state, queue: data.tracks };
  } catch {
    /* keep current queue on failure */
  }
}

function nextImpl(fromEnded: boolean) {
  if (state.queue.length === 0) return;
  let nextIdx: number;
  if (state.shuffle) {
    nextIdx = Math.floor(Math.random() * state.queue.length);
  } else if (state.currentIndex + 1 < state.queue.length) {
    nextIdx = state.currentIndex + 1;
  } else if (state.repeat === "all") {
    nextIdx = 0;
  } else {
    if (fromEnded) {
      stopTimeUpdates();
      emit({ ...state, isPlaying: false, currentTime: 0 });
    }
    return;
  }
  loadTrackAt(nextIdx, true);
}

function prevImpl() {
  if (state.queue.length === 0) return;
  if (state.currentTime > 3) {
    seekImpl(0);
    return;
  }
  let nextIdx: number;
  if (state.currentIndex > 0) {
    nextIdx = state.currentIndex - 1;
  } else if (state.repeat === "all") {
    nextIdx = state.queue.length - 1;
  } else {
    seekImpl(0);
    return;
  }
  loadTrackAt(nextIdx, true);
}

function seekImpl(time: number) {
  const audio = ensureAudio();
  if (audio.readyState === 0 && state.queue[state.currentIndex]) {
    audio.src = state.queue[state.currentIndex].streamUrl;
    audio.load();
  }
  const clamped = Math.max(0, isFinite(time) ? time : 0);
  try {
    audio.currentTime = clamped;
  } catch {}
  emit({ ...state, currentTime: clamped });
  syncMediaSessionPosition();
}

function setMediaSessionMetadata(track: PlayerTrack) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.trackName,
      artist: "Party Pupils",
      album: track.releaseName,
      artwork: track.coverImageUrl ? [{ src: track.coverImageUrl, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => toggleImpl());
    navigator.mediaSession.setActionHandler("pause", () => toggleImpl());
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      void nextPublic();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => prevImpl());
    navigator.mediaSession.setActionHandler("seekto", (e) => {
      if (typeof e.seekTime === "number") seekImpl(e.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekforward", (e) => {
      seekImpl(state.currentTime + (e.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekbackward", (e) => {
      seekImpl(Math.max(0, state.currentTime - (e.seekOffset || 10)));
    });
  } catch (e) {
    console.warn("MediaSession setup failed", e);
  }
}

function syncMediaSessionPosition() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  if (!state.duration || !isFinite(state.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: state.duration,
      position: Math.min(state.currentTime, state.duration),
      playbackRate: 1,
    });
  } catch {}
}

function toggleImpl() {
  if (state.currentIndex < 0) return;
  const audio = ensureAudio();
  const track = state.queue[state.currentIndex];
  if (state.isPlaying) {
    audio.pause();
    stopTimeUpdates();
    emit({ ...state, isPlaying: false });
  } else {
    if (!audio.src || (audio.src && !audio.src.endsWith(track.streamUrl.split("/").pop() ?? ""))) {
      audio.src = track.streamUrl;
      audio.load();
      const resume = state.currentTime;
      const onMeta = () => {
        try {
          if (resume > 0 && resume < (audio.duration || Infinity)) audio.currentTime = resume;
        } catch {}
        audio.removeEventListener("loadedmetadata", onMeta);
      };
      audio.addEventListener("loadedmetadata", onMeta);
    }
    audio.play().catch((e) => {
      console.warn("Play blocked", e);
    });
    startTimeUpdates();
    emit({ ...state, isPlaying: true });
  }
}

interface PlayQueueOptions {
  shuffle?: boolean;
  repeat?: RepeatMode;
}

function playQueueImpl(
  queue: PlayerTrack[],
  startIndex: number,
  source: QueueSource = "release",
  options?: PlayQueueOptions,
) {
  if (queue.length === 0) return;
  const idx = Math.max(0, Math.min(startIndex, queue.length - 1));
  state = {
    ...state,
    queue,
    currentIndex: idx,
    queueSource: source,
    shuffle: options?.shuffle ?? state.shuffle,
    repeat: options?.repeat ?? state.repeat,
  };
  loadTrackAt(idx, true);
}

/** Insert a track immediately after the current one and play it. After it ends, the queue continues. */
function playNextImpl(track: PlayerTrack) {
  if (state.queue.length === 0 || state.currentIndex < 0) {
    playQueueImpl([track], 0, "track");
    return;
  }
  const insertAt = state.currentIndex + 1;
  const newQueue = [
    ...state.queue.slice(0, insertAt),
    track,
    ...state.queue.slice(insertAt),
  ];
  state = { ...state, queue: newQueue };
  loadTrackAt(insertAt, true);
}

/** Load a queue without autoplay — used for first-visit seeding so the bar appears ready-to-play. */
function seedQueueImpl(queue: PlayerTrack[], startIndex: number = 0, source: QueueSource = "radio") {
  if (queue.length === 0) return;
  if (state.currentIndex >= 0) return;
  const idx = Math.max(0, Math.min(startIndex, queue.length - 1));
  const track = queue[idx];
  const audio = ensureAudio();
  audio.src = track.streamUrl;
  emit({
    ...state,
    queue,
    currentIndex: idx,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    queueSource: source,
  });
  setMediaSessionMetadata(track);
}

function clearImpl() {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
  }
  stopTimeUpdates();
  emit({ ...EMPTY_PLAYER_STATE });
}

async function nextPublic() {
  await maybeRefreshRadioQueue();
  nextImpl(false);
}

function rehydrate() {
  const persisted = loadPersisted();
  if (!persisted || persisted.queue.length === 0 || persisted.currentIndex < 0) return;
  const audio = ensureAudio();
  const track = persisted.queue[persisted.currentIndex];
  if (track) {
    audio.src = track.streamUrl;
    const resume = persisted.currentTime;
    const onMeta = () => {
      try {
        if (resume > 0 && resume < (audio.duration || Infinity)) audio.currentTime = resume;
      } catch {}
      audio.removeEventListener("loadedmetadata", onMeta);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    setMediaSessionMetadata(track);
  }
  emit(
    {
      queue: persisted.queue,
      currentIndex: persisted.currentIndex,
      currentTime: persisted.currentTime,
      duration: 0,
      isPlaying: false,
      shuffle: persisted.shuffle ?? false,
      repeat: persisted.repeat ?? "off",
      queueSource: persisted.queueSource ?? null,
    },
    { persist: "skip" }
  );
}

function subscribe(listener: () => void) {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    rehydrate();
  }
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

interface AudioContextType {
  state: PlayerState & { trackId: number | null; currentTrack: PlayerTrack | null };
  playQueue: (queue: PlayerTrack[], startIndex: number, source?: QueueSource, options?: PlayQueueOptions) => void;
  playNext: (track: PlayerTrack) => void;
  seedQueue: (queue: PlayerTrack[], startIndex?: number, source?: QueueSource) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  clear: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const currentTrack = raw.currentIndex >= 0 ? raw.queue[raw.currentIndex] ?? null : null;
  const trackId = currentTrack?.trackId ?? null;

  const value: AudioContextType = {
    state: { ...raw, trackId, currentTrack },
    playQueue: playQueueImpl,
    playNext: playNextImpl,
    seedQueue: seedQueueImpl,
    toggle: toggleImpl,
    next: nextPublic,
    prev: prevImpl,
    seek: seekImpl,
    clear: clearImpl,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (state.currentIndex < 0) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          toggleImpl();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) nextImpl(false);
          else seekImpl(Math.min(state.duration || Infinity, state.currentTime + 5));
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) prevImpl();
          else seekImpl(Math.max(0, state.currentTime - 5));
          break;
        case "KeyM":
          if (audioEl) audioEl.muted = !audioEl.muted;
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
