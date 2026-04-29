"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useAudio } from "./AudioProvider";
import { Button } from "@/components/ui/button";

interface PlayButtonProps {
  track: PlayerTrack;
  /** Unused — kept for prop-API stability with previous callers. */
  queue?: PlayerTrack[];
  /** Unused — kept for prop-API stability with previous callers. */
  index?: number;
}

export function PlayButton({ track }: PlayButtonProps) {
  const { state, toggle, playNext } = useAudio();

  const isCurrent = state.trackId === track.trackId;
  const isThisPlaying = isCurrent && state.isPlaying;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        if (isCurrent) toggle();
        else playNext(track);
      }}
      aria-label={isThisPlaying ? "Pause" : "Play"}
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
    </Button>
  );
}
