"use client";

import { useAudio } from "./AudioProvider";

interface PlayButtonProps {
  trackId: number;
  previewUrl: string | null;
}

export function PlayButton({ trackId, previewUrl }: PlayButtonProps) {
  const { state, toggle } = useAudio();

  if (!previewUrl) return null;

  const isThisPlaying = state.trackId === trackId && state.isPlaying;

  return (
    <button
      onClick={() => toggle(trackId, previewUrl)}
      aria-label={isThisPlaying ? "Pause" : "Play"}
      className="neon-link shrink-0 p-1"
    >
      {isThisPlaying ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="6,4 20,12 6,20" />
        </svg>
      )}
    </button>
  );
}
