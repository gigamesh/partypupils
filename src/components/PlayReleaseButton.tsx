"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useAudio } from "./AudioProvider";

interface PlayReleaseButtonProps {
  tracks: PlayerTrack[];
  label?: string;
  className?: string;
}

export function PlayReleaseButton({
  tracks,
  label = "Play release",
  className = "",
}: PlayReleaseButtonProps) {
  const { state, playQueue, toggle } = useAudio();

  if (tracks.length === 0) return null;
  const releaseId = tracks[0].releaseId;
  const isThisQueue =
    state.currentTrack?.releaseId === releaseId &&
    state.queue.length === tracks.length &&
    state.queue[0]?.trackId === tracks[0].trackId;
  const isPlaying = isThisQueue && state.isPlaying;

  return (
    <button
      type="button"
      onClick={() => {
        if (isThisQueue) toggle();
        else playQueue(tracks, 0, "release", { shuffle: false, repeat: "off" });
      }}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-full bg-neon px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
      }
      aria-label={isPlaying ? `Pause ${label}` : label}
    >
      {isPlaying ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6,4 20,12 6,20" />
        </svg>
      )}
      <span>{isPlaying ? "Pause" : label}</span>
    </button>
  );
}
