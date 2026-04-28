"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { useAudio } from "./AudioProvider";
import { NowPlayingIndicator } from "./NowPlayingIndicator";

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayPauseIcon({ playing, size = 22 }: { playing: boolean; size?: number }) {
  if (playing) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

function SkipIcon({ direction, size = 18 }: { direction: "next" | "prev"; size?: number }) {
  const flip = direction === "prev" ? "scale-x-[-1]" : "";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={flip}>
      <polygon points="5,4 16,12 5,20" />
      <rect x="17" y="4" width="2" height="16" rx="1" />
    </svg>
  );
}

function ChevronUpIcon({ size = 18 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDownIcon({ size = 22 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Scrubber({ currentTime, duration, onSeek }: { currentTime: number; duration: number; onSeek: (t: number) => void }) {
  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  return (
    <div
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      className="relative h-1.5 w-full rounded-full bg-white/15"
      onClick={(e) => {
        if (!duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const r = (e.clientX - rect.left) / rect.width;
        onSeek(r * duration);
      }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-neon"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

export function PlayerBar() {
  const { state, toggle, next, prev, seek } = useAudio();
  const [expanded, setExpanded] = useState(false);

  const track = state.currentTrack;
  if (!track) return null;

  return (
    <div
      data-expanded={expanded ? "true" : "false"}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-background/85 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Brand strip */}
      <div className="flex items-center justify-center gap-2 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-neon/80">
        <span>Party Pupils Radio</span>
        <span className={state.isPlaying ? "text-neon/40" : "text-neon/15"}>•</span>
        <NowPlayingIndicator size={10} active={state.isPlaying} />
        <span className={state.isPlaying ? "text-neon/60" : "text-neon/25"}>On Air</span>
      </div>

      {/* Mobile expanded sheet — animated via grid-rows trick */}
      <div
        className={`md:hidden grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!expanded}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/music/${track.releaseSlug}`}
                onClick={() => setExpanded(false)}
                className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-muted"
              >
                {track.coverImageUrl ? (
                  <Image src={track.coverImageUrl} alt={track.releaseName} fill className="object-cover" sizes="112px" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl text-neon/30">♪</div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium leading-tight truncate">{track.trackName}</div>
                <Link
                  href={`/music/${track.releaseSlug}`}
                  onClick={() => setExpanded(false)}
                  className="neon-link text-sm truncate block"
                >
                  {track.releaseName}
                </Link>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setExpanded(false)}
                aria-label="Collapse"
                tabIndex={expanded ? 0 : -1}
              >
                <ChevronDownIcon />
              </Button>
            </div>

            <Scrubber currentTime={state.currentTime} duration={state.duration} onSeek={seek} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(state.currentTime)}</span>
              <span>{formatTime(state.duration)}</span>
            </div>

            <div className="flex items-center justify-center gap-6">
              <Button variant="ghost" size="icon-lg" onClick={prev} aria-label="Previous" tabIndex={expanded ? 0 : -1}>
                <SkipIcon direction="prev" size={22} />
              </Button>
              <Button
                variant="pill"
                size="icon-xl"
                onClick={toggle}
                aria-label={state.isPlaying ? "Pause" : "Play"}
                tabIndex={expanded ? 0 : -1}
              >
                <PlayPauseIcon playing={state.isPlaying} size={26} />
              </Button>
              <Button variant="ghost" size="icon-lg" onClick={next} aria-label="Next" tabIndex={expanded ? 0 : -1}>
                <SkipIcon direction="next" size={22} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Compact bar — collapses on mobile when expanded; always shown on desktop */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out md:grid-rows-[1fr] md:opacity-100 ${
          expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
        aria-hidden={expanded}
      >
        <div className="overflow-hidden">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4 md:h-14">
        <Link
          href={`/music/${track.releaseSlug}`}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted md:h-11 md:w-11"
        >
          {track.coverImageUrl ? (
            <Image src={track.coverImageUrl} alt={track.releaseName} fill className="object-cover" sizes="44px" />
          ) : (
            <div className="flex h-full items-center justify-center text-lg text-neon/30">♪</div>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{track.trackName}</div>
          <Link
            href={`/music/${track.releaseSlug}`}
            className="neon-link block truncate text-xs leading-tight"
          >
            {track.releaseName}
          </Link>
        </div>

        {/* Desktop transport */}
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="icon-sm" onClick={prev} aria-label="Previous">
            <SkipIcon direction="prev" />
          </Button>
          <Button
            variant="pill"
            size="icon-sm"
            onClick={toggle}
            aria-label={state.isPlaying ? "Pause" : "Play"}
          >
            <PlayPauseIcon playing={state.isPlaying} size={18} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={next} aria-label="Next">
            <SkipIcon direction="next" />
          </Button>
        </div>

        {/* Desktop scrubber + time */}
        <div className="hidden flex-1 items-center gap-2 md:flex">
          <span className="w-10 text-right text-xs text-muted-foreground">{formatTime(state.currentTime)}</span>
          <div className="flex-1">
            <Scrubber currentTime={state.currentTime} duration={state.duration} onSeek={seek} />
          </div>
          <span className="w-10 text-xs text-muted-foreground">{formatTime(state.duration)}</span>
        </div>

        {/* Mobile transport */}
        <div className="flex items-center gap-1 md:hidden">
          <Button
            variant="pill"
            size="icon-sm"
            onClick={toggle}
            aria-label={state.isPlaying ? "Pause" : "Play"}
          >
            <PlayPauseIcon playing={state.isPlaying} size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded(true)}
            aria-label="Expand player"
          >
            <ChevronUpIcon size={20} />
          </Button>
        </div>
      </div>

      {/* Mobile thin progress (under bar) */}
      <div className="md:hidden px-4 pb-3">
        <Scrubber currentTime={state.currentTime} duration={state.duration} onSeek={seek} />
      </div>
        </div>
      </div>
    </div>
  );
}
