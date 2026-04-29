"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useAudio } from "./AudioProvider";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { NowPlayingIndicator } from "./NowPlayingIndicator";

interface ReleasePlayOverlayProps {
  tracks: PlayerTrack[];
  releaseId: number;
}

export function ReleasePlayOverlay({ tracks, releaseId }: ReleasePlayOverlayProps) {
  const { state, playQueue, toggle } = useAudio();

  if (tracks.length === 0) return null;

  const isCurrentRelease = state.currentTrack?.releaseId === releaseId;
  const isPlaying = isCurrentRelease && state.isPlaying;

  return (
    <>
      {isCurrentRelease && (
        <div className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
          <NowPlayingIndicator active={isPlaying} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/40" />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play release"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isCurrentRelease) toggle();
            else playQueue(tracks, 0, "release", { shuffle: false, repeat: "off" });
          }}
          className={cn(buttonVariants({ variant: "pill", size: "icon-xl" }), "pointer-events-auto shadow-lg")}
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
