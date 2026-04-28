"use client";

import { useEffect, useRef } from "react";
import { useAudio } from "./AudioProvider";
import type { PlayerTrack } from "@/lib/player-types";

/**
 * On a visitor's first visit (empty player localStorage), fetch the full track
 * catalog shuffled and seed it as their personal random mix. The bar appears
 * loaded but paused; tapping play starts the mix. Subsequent visits skip this
 * because their persisted queue is already restored.
 */
export function RandomMixSeeder() {
  const { state, seedQueue } = useAudio();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (state.currentIndex >= 0) return;
    fetchedRef.current = true;

    let cancelled = false;
    fetch("/api/all-tracks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tracks: PlayerTrack[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.tracks) || data.tracks.length === 0) return;
        seedQueue(data.tracks, 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.currentIndex, seedQueue]);

  return null;
}
