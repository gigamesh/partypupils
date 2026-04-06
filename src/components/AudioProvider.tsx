"use client";

import { createContext, useContext, useCallback, useRef, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface AudioState {
  trackId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

interface AudioContextType {
  state: AudioState;
  toggle: (trackId: number, previewUrl: string) => void;
  seek: (time: number) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

let audioState: AudioState = { trackId: null, isPlaying: false, currentTime: 0, duration: 0 };
let audioListeners: (() => void)[] = [];

function getAudioSnapshot() {
  return audioState;
}

const SERVER_STATE: AudioState = { trackId: null, isPlaying: false, currentTime: 0, duration: 0 };

function getAudioServerSnapshot() {
  return SERVER_STATE;
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
  const rafRef = useRef<number | null>(null);
  const pathname = usePathname();

  const state = useSyncExternalStore(subscribeAudio, getAudioSnapshot, getAudioServerSnapshot);

  useEffect(() => {
    if (audioRef.current && state.isPlaying) {
      audioRef.current.pause();
      emitAudioChange({ trackId: null, isPlaying: false, currentTime: 0, duration: 0 });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTimeUpdate = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio && audioState.isPlaying) {
        emitAudioChange({
          ...audioState,
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
        });
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTimeUpdate = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const toggle = useCallback((trackId: number, previewUrl: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => {
        stopTimeUpdate();
        emitAudioChange({ trackId: null, isPlaying: false, currentTime: 0, duration: 0 });
      });
    }

    const audio = audioRef.current;

    if (state.trackId === trackId && state.isPlaying) {
      audio.pause();
      stopTimeUpdate();
      emitAudioChange({ ...audioState, isPlaying: false });
    } else if (state.trackId === trackId && !state.isPlaying) {
      audio.play();
      emitAudioChange({ ...audioState, isPlaying: true });
      startTimeUpdate();
    } else {
      audio.src = previewUrl;
      audio.play();
      emitAudioChange({ trackId, isPlaying: true, currentTime: 0, duration: 0 });
      startTimeUpdate();
    }
  }, [state.trackId, state.isPlaying, startTimeUpdate, stopTimeUpdate]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      emitAudioChange({ ...audioState, currentTime: time });
    }
  }, []);

  return (
    <AudioContext.Provider value={{ state, toggle, seek }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
