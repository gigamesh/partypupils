"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
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
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => searchTracks(index, deferredQuery),
    [index, deferredQuery],
  );
  const isSearching = deferredQuery.trim().length > 0;

  return (
    <>
      <div className="mb-6">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs..."
          aria-label="Search songs"
          className="h-10"
        />
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
            />
          ))}
        </div>
      )}
    </>
  );
}
