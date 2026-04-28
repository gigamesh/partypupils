"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useAudio } from "./AudioProvider";
import { Button } from "@/components/ui/button";

interface PlayReleaseButtonProps {
  tracks: PlayerTrack[];
  label?: string;
  className?: string;
}

export function PlayReleaseButton({
  tracks,
  label = "Play release",
  className,
}: PlayReleaseButtonProps) {
  const { state, playQueue, toggle } = useAudio();

  if (tracks.length === 0) return null;
  const releaseId = tracks[0].releaseId;
  const isCurrentRelease = state.currentTrack?.releaseId === releaseId;
  const isPlaying = isCurrentRelease && state.isPlaying;

  return (
    <Button
      variant="pill"
      size="cta"
      onClick={() => {
        if (isPlaying) toggle();
        else playQueue(tracks, 0, "release", { shuffle: false, repeat: "off" });
      }}
      aria-label={isPlaying ? `Pause ${label}` : label}
      className={className}
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
    </Button>
  );
}
