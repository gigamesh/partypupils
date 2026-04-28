"use client";

import { useEffect, useState } from "react";
import { useAudio } from "./AudioProvider";

interface TrackProgressProps {
  trackId: number;
  /** Stream URL — when provided, the row probes audio metadata to display the static duration even before playback. */
  streamUrl?: string;
  alwaysShow?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackProgress({ trackId, streamUrl, alwaysShow = false }: TrackProgressProps) {
  const { state, seek } = useAudio();
  const [probedDuration, setProbedDuration] = useState<number | null>(null);

  const isActive = state.trackId === trackId;
  const activeDuration = isActive && state.duration > 0 ? state.duration : 0;
  const duration = activeDuration || probedDuration || 0;
  const currentTime = isActive ? state.currentTime : 0;
  const hasDuration = duration > 0;
  const progress = hasDuration ? currentTime / duration : 0;

  useEffect(() => {
    if (isActive) return; // active duration comes from the live player
    if (!streamUrl) return;
    if (probedDuration != null) return;

    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = streamUrl;
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProbedDuration(audio.duration);
      }
    };
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeAttribute("src");
      audio.load();
    };
  }, [streamUrl, isActive, probedDuration]);

  if (!alwaysShow && !isActive) return null;

  return (
    <div className="flex flex-1 items-center gap-3">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatTime(currentTime)}
      </span>
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        className="relative h-1.5 flex-1 rounded-full bg-muted"
        onClick={(e) => {
          if (!isActive || !hasDuration) return;
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(ratio * duration);
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-neon transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatTime(duration)}
      </span>
    </div>
  );
}
