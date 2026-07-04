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
import {
  advanceQueue,
  buildInitialQueue,
  reconcileSource,
  retreatQueue,
} from "@/lib/player-data";

const STORAGE_KEY = "party-pupils-player";

let state: PlayerState = EMPTY_PLAYER_STATE;
let listeners: (() => void)[] = [];
let audioEl: HTMLAudioElement | null = null;
let prefetchEl: HTMLAudioElement | null = null;
let lastPrefetchedUrl: string | null = null;
let rafHandle: number | null = null;
let initialized = false;

function isValidPersistedTrack(t: unknown): t is PlayerTrack {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.trackId === "number" &&
    typeof r.trackName === "string" &&
    typeof r.trackSlug === "string" &&
    typeof r.trackNumber === "number" &&
    typeof r.releaseId === "number" &&
    typeof r.releaseName === "string" &&
    typeof r.releaseSlug === "string" &&
    typeof r.streamUrl === "string"
  );
}

function cleanTracks(arr: unknown): PlayerTrack[] {
  return Array.isArray(arr) ? arr.filter(isValidPersistedTrack) : [];
}

function loadPersisted(): PersistedPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const currentTime = typeof parsed.currentTime === "number" ? parsed.currentTime : 0;
    const shuffle = typeof parsed.shuffle === "boolean" ? parsed.shuffle : false;
    const repeat = (parsed.repeat as RepeatMode) ?? "off";
    const queueSource = (parsed.queueSource as QueueSource) ?? null;

    // Current timeline shape (history / current / upNext / source). Invalid
    // track entries — e.g. from a deploy that pre-dates a PlayerTrack field —
    // are dropped so `undefined` can't leak into a stream URL.
    if ("current" in parsed || "upNext" in parsed) {
      const current = isValidPersistedTrack(parsed.current) ? (parsed.current as PlayerTrack) : null;
      return {
        history: cleanTracks(parsed.history),
        current,
        upNext: cleanTracks(parsed.upNext),
        source: cleanTracks(parsed.source),
        currentTime,
        shuffle,
        repeat,
        queueSource,
      };
    }

    // Legacy shape (pre-timeline: `queue` + `currentIndex`). Migrate once so a
    // mid-song listener keeps their spot; the stored array order becomes the
    // up-next, the tracks before the cursor become history.
    if (Array.isArray(parsed.queue) && typeof parsed.currentIndex === "number") {
      const queue = cleanTracks(parsed.queue);
      const idx = parsed.currentIndex;
      if (idx < 0 || idx >= queue.length) return null;
      return {
        history: queue.slice(0, idx),
        current: queue[idx],
        upNext: queue.slice(idx + 1),
        source: queue,
        currentTime,
        shuffle,
        repeat,
        queueSource,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function persist(s: PlayerState) {
  if (typeof window === "undefined") return;
  const toSave: PersistedPlayerState = {
    history: s.history,
    current: s.current,
    upNext: s.upNext,
    source: s.source,
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

/** The exact track that will play on "next" — the head of up-next. Materializing
 *  the queue makes this precise (no guessing), so prefetch never mispredicts. */
function nextTrackInQueue(): PlayerTrack | null {
  if (!state.current) return null;
  return state.upNext[0] ?? null;
}

/** Load `state.current` into the audio element and (optionally) start playback.
 *  The timeline (history/current/upNext) must already be set on `state`. */
function loadCurrent(autoplay: boolean) {
  const track = state.current;
  if (!track) return;
  const audio = ensureAudio();
  audio.src = track.streamUrl;
  audio.load();
  emit({ ...state, currentTime: 0, duration: 0, isPlaying: autoplay });
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
 * When the queue source is the radio, refresh the track pool from /api/all-tracks
 * before advancing. This lets admin `inRadio` toggles reach already-listening
 * visitors at song boundaries: pulled tracks drop from up-next immediately, added
 * tracks join at the next cycle wrap. Silent no-op on network failure or empty
 * result; non-radio queues are left untouched.
 */
async function maybeRefreshRadioQueue() {
  if (state.queueSource !== "radio") return;
  try {
    const r = await fetch("/api/all-tracks");
    if (!r.ok) return;
    const data = (await r.json()) as { tracks: PlayerTrack[] };
    if (!Array.isArray(data.tracks) || data.tracks.length === 0) return;
    const { upNext, source } = reconcileSource(state.upNext, data.tracks);
    state = { ...state, upNext, source };
  } catch {
    /* keep current queue on failure */
  }
}

function nextImpl(fromEnded: boolean) {
  if (!state.current) return;
  const next = advanceQueue(
    { history: state.history, current: state.current, upNext: state.upNext, source: state.source },
    state.shuffle,
    state.repeat,
  );
  if (!next) {
    // End of a non-repeating queue: stop at the final track.
    if (fromEnded) {
      stopTimeUpdates();
      emit({ ...state, isPlaying: false, currentTime: 0 });
    }
    return;
  }
  state = { ...state, history: next.history, current: next.current, upNext: next.upNext };
  loadCurrent(true);
}

function prevImpl() {
  if (!state.current) return;
  if (state.currentTime > 3) {
    seekImpl(0);
    return;
  }
  const prev = retreatQueue({ history: state.history, current: state.current, upNext: state.upNext });
  if (!prev) {
    // Nothing earlier in the timeline — restart the current track.
    seekImpl(0);
    return;
  }
  state = { ...state, history: prev.history, current: prev.current, upNext: prev.upNext };
  loadCurrent(true);
}

function seekImpl(time: number) {
  const audio = ensureAudio();
  if (audio.readyState === 0 && state.current) {
    audio.src = state.current.streamUrl;
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
  if (!state.current) return;
  const audio = ensureAudio();
  const track = state.current;
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
  tracks: PlayerTrack[],
  startIndex: number,
  source: QueueSource = "release",
  options?: PlayQueueOptions,
) {
  if (tracks.length === 0) return;
  const shuffle = options?.shuffle ?? state.shuffle;
  const built = buildInitialQueue(tracks, startIndex, shuffle);
  state = {
    ...state,
    history: built.history,
    current: built.current,
    upNext: built.upNext,
    source: tracks,
    queueSource: source,
    shuffle,
    repeat: options?.repeat ?? state.repeat,
  };
  loadCurrent(true);
}

/** Insert a track to play immediately; the prior track moves to history and the
 *  rest of the queue resumes after it ends. */
function playNextImpl(track: PlayerTrack) {
  if (!state.current) {
    playQueueImpl([track], 0, "track");
    return;
  }
  state = { ...state, upNext: [track, ...state.upNext] };
  nextImpl(false);
}

/** Load a queue without autoplay — used for first-visit seeding so the bar appears ready-to-play. */
function seedQueueImpl(tracks: PlayerTrack[], startIndex: number = 0, source: QueueSource = "radio") {
  if (tracks.length === 0) return;
  if (state.current) return;
  const built = buildInitialQueue(tracks, startIndex, state.shuffle);
  if (!built.current) return;
  const audio = ensureAudio();
  audio.src = built.current.streamUrl;
  emit({
    ...state,
    history: built.history,
    current: built.current,
    upNext: built.upNext,
    source: tracks,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    queueSource: source,
  });
  setMediaSessionMetadata(built.current);
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
  if (!persisted || !persisted.current) return;
  const audio = ensureAudio();
  const track = persisted.current;
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
  emit(
    {
      history: persisted.history,
      current: persisted.current,
      upNext: persisted.upNext,
      source: persisted.source,
      currentTime: persisted.currentTime,
      duration: 0,
      isPlaying: false,
      shuffle: persisted.shuffle,
      repeat: persisted.repeat,
      queueSource: persisted.queueSource,
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
  const currentTrack = raw.current;
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
      if (!state.current) return;
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
