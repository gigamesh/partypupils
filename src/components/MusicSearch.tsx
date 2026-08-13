"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TrackRow } from "@/components/TrackRow";
import { Input } from "@/components/ui/input";
import { searchTracks, type SearchableTrack } from "@/lib/track-search";

interface Props {
  /** The full published catalog, flattened to one entry per song. */
  index: SearchableTrack[];
  /** The default /music body — bundles and the release grid — shown when the box is empty. */
  children: ReactNode;
}

/**
 * Search box for /music. The whole catalog arrives with the page, so filtering
 * is instant and needs no round-trip; typing swaps the release grid out for a
 * flat list of matching songs.
 */
export function MusicSearch({ index, children }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => searchTracks(index, deferredQuery),
    [index, deferredQuery],
  );
  const isSearching = deferredQuery.trim().length > 0;

  // The fixed player bar eats the little room left once the mobile keyboard is
  // up, so it steps aside while the box has focus (see `body.search-focus`).
  const setSearchFocus = (focused: boolean) => {
    document.body.classList.toggle("search-focus", focused);
  };
  useEffect(() => {
    return () => {
      document.body.classList.remove("search-focus");
    };
  }, []);

  return (
    <>
      <div className="relative mb-6">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholder="Search songs..."
          aria-label="Search songs"
          // `glass-panel` fills near-black; the white overlay lifts the box off
          // the result cards below it. Both halves of the pair are needed —
          // Input's base `dark:bg-input/30` is variant-scoped, so it outranks a
          // plain `bg-white/*` on specificity.
          //
          // The native clear button is suppressed because WebKit doesn't render
          // it on touch devices at all and styles it dark elsewhere; the white
          // button below replaces it on every platform.
          className="glass-panel h-10 bg-white/10 pr-10 dark:bg-white/10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {!isSearching ? (
        children
      ) : results.length === 0 ? (
        <p className="text-muted-foreground">
          No songs match &ldquo;{deferredQuery.trim()}&rdquo;.
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((result) => (
            <TrackRow
              key={result.track.id}
              track={result.track}
              release={result.release}
              playerTrack={result.playerTrack}
              className="glass-panel"
            />
          ))}
        </div>
      )}
    </>
  );
}
