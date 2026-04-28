"use client";

import type { PlayerTrack } from "@/lib/player-types";
import { useState } from "react";
import { useAudio } from "./AudioProvider";

interface Props {
  className?: string;
}

/**
 * Tunes in to a fresh random shuffle of the entire catalog. When the radio is
 * already the active source, the button toggles play/pause and reflects the
 * current playback state.
 */
export function PartyPupilsRadioButton({ className = "" }: Props) {
  const { state, playQueue, toggle } = useAudio();
  const [loading, setLoading] = useState(false);

  const isRadio = state.queueSource === "radio" && state.currentIndex >= 0;
  const isPlayingRadio = isRadio && state.isPlaying;

  const handleClick = async () => {
    if (loading) return;
    if (isRadio) {
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
    : isPlayingRadio
      ? "Pause Party Pupils Radio"
      : "Tune in to Party Pupils Radio";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-full bg-neon px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      }
      aria-label={label}
    >
      {isPlayingRadio ? (
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
    </button>
  );
}
