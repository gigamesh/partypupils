"use client";

import { useEffect } from "react";
import { useAudio } from "./AudioProvider";

/** Adds bottom padding to the body when a track is loaded so the fixed PlayerBar doesn't cover content. */
export function PlayerSpacer() {
  const { state } = useAudio();
  const active = state.currentIndex >= 0;
  useEffect(() => {
    document.body.classList.toggle("has-player", active);
    return () => {
      document.body.classList.remove("has-player");
    };
  }, [active]);
  return null;
}
