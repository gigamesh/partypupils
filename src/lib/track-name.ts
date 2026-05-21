/** Track-name helpers shared by the admin release form and maintenance scripts. */

/** Best-effort split of a legacy `"Artist - Title"` track name when no explicit artist is stored. */
export function splitArtistTitle(name: string): { artist: string; title: string } {
  const idx = name.indexOf(" - ");
  if (idx < 0) return { artist: "", title: name };
  return { artist: name.slice(0, idx).trim(), title: name.slice(idx + 3).trim() };
}

/** Combine artist + title into the legacy single-string display name used in download filenames and listings. */
export function combinedName(artist: string, title: string): string {
  const a = artist.trim();
  const t = title.trim();
  return a ? `${a} - ${t}` : t;
}

/**
 * Resolve a track's display artist + title from its stored `name`/`artist`. When an
 * explicit `artist` exists it is authoritative (and a leading `"Artist - "` prefix is
 * stripped off the name); otherwise the legacy `"Artist - Title"` name is split.
 */
export function deriveTrackArtistTitle(
  name: string,
  artist: string | null,
): { artist: string; title: string } {
  if (artist == null) return splitArtistTitle(name);
  return {
    artist,
    title: name.startsWith(`${artist} - `) ? name.slice(artist.length + 3) : name,
  };
}
