"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useState } from "react";
import { useAudio } from "./AudioProvider";
import { Button } from "@/components/ui/button";

/**
 * Master play/pause for the global player, branded as Party Pupils Radio.
 * - With anything loaded in the queue: behaves like the player bar's play
 *   button (toggles play/pause, icon mirrors `state.isPlaying`).
 * - With an empty queue: fetches a fresh random shuffle and starts playing.
 */
export function PartyPupilsRadioButton({ className }: { className?: string }) {
  const { state, playQueue, toggle } = useAudio();
  const [loading, setLoading] = useState(false);

  const hasQueue = state.currentIndex >= 0;
  const isPlaying = hasQueue && state.isPlaying;

  const handleClick = async () => {
    if (loading) return;
    if (hasQueue) {
      toggle();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/all-tracks", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { tracks: PlayerTrack[] };
      if (data.tracks?.length > 0) playQueue(data.tracks, 0, "radio", { shuffle: true, repeat: "all" });
    } catch {
      /* swallow — button stays usable */
    } finally {
      setLoading(false);
    }
  };

  const label = loading
    ? "Tuning in…"
    : isPlaying
      ? "Pause"
      : hasQueue
        ? "Play"
        : "Tune in to Party Pupils Radio";

  return (
    <Button
      variant="pill"
      size="cta"
      onClick={handleClick}
      disabled={loading}
      aria-label={label}
      className={className}
    >
      {isPlaying ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="6,4 20,12 6,20" />
        </svg>
      )}
      <span>{loading ? "Tuning in…" : "Party Pupils Radio"}</span>
    </Button>
  );
}
