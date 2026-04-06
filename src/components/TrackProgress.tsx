"use client";

import { useAudio } from "./AudioProvider";

interface TrackProgressProps {
  trackId: number;
  alwaysShow?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackProgress({ trackId, alwaysShow = false }: TrackProgressProps) {
  const { state, seek } = useAudio();

  const isActive = state.trackId === trackId;
  const hasDuration = isActive && state.duration > 0;

  if (!alwaysShow && !hasDuration) return null;

  const progress = hasDuration ? state.currentTime / state.duration : 0;

  return (
    <div className="flex flex-1 items-center gap-3">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {hasDuration ? formatTime(state.currentTime) : "0:00"}
      </span>
      <div
        className="relative flex-1 h-1.5 rounded-full bg-muted cursor-pointer"
        onClick={(e) => {
          if (!hasDuration) return;
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(ratio * state.duration);
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-neon transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {hasDuration ? formatTime(state.duration) : "0:00"}
      </span>
    </div>
  );
}
