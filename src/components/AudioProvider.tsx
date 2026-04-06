"use client";

import { createContext, useContext, useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";

interface AudioState {
  trackId: number | null;
  isPlaying: boolean;
}

interface AudioContextType {
  state: AudioState;
  toggle: (trackId: number, previewUrl: string) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

let audioState: AudioState = { trackId: null, isPlaying: false };
let audioListeners: (() => void)[] = [];

function getAudioSnapshot() {
  return audioState;
}

function getAudioServerSnapshot() {
  return audioState;
}

function subscribeAudio(listener: () => void) {
  audioListeners = [...audioListeners, listener];
  return () => {
    audioListeners = audioListeners.filter((l) => l !== listener);
  };
}

function emitAudioChange(next: AudioState) {
  audioState = next;
  for (const listener of audioListeners) listener();
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const state = useSyncExternalStore(subscribeAudio, getAudioSnapshot, getAudioServerSnapshot);

  const toggle = useCallback((trackId: number, previewUrl: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => {
        emitAudioChange({ trackId: null, isPlaying: false });
      });
    }

    const audio = audioRef.current;

    if (state.trackId === trackId && state.isPlaying) {
      audio.pause();
      emitAudioChange({ trackId, isPlaying: false });
    } else if (state.trackId === trackId && !state.isPlaying) {
      audio.play();
      emitAudioChange({ trackId, isPlaying: true });
    } else {
      audio.src = previewUrl;
      audio.play();
      emitAudioChange({ trackId, isPlaying: true });
    }
  }, [state.trackId, state.isPlaying]);

  return (
    <AudioContext.Provider value={{ state, toggle }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
