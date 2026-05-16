"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAudio } from "./AudioProvider";
import type { PlayerTrack } from "@/lib/player-types";

interface Props {
  href: string;
  /** When provided, clicking starts this track playing immediately so the
   *  new page loads with audio already in flight. */
  playerTrack: PlayerTrack | null;
  className?: string;
  children: ReactNode;
}

export function TracklistRowLink({ href, playerTrack, className, children }: Props) {
  const { playNext } = useAudio();
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (playerTrack) playNext(playerTrack);
      }}
    >
      {children}
    </Link>
  );
}
