/**
 * Pure helpers backing `ReleaseForm.tsx`. They live here rather than inside
 * the component so they're unit-testable: the form itself is a client
 * component, and the test runner is node-only (`tests/**\/*.test.ts`), so
 * anything left in the .tsx is effectively untestable.
 */
import { slugify } from "./utils";

/** The subset of a form track the slug rules need. */
export interface TrackSlugState {
  /** Set once the track has been persisted; absent for a track being added. */
  existingId?: number;
  slug: string;
  trackNumber: number;
  /**
   * True once the slug belongs to the admin rather than to the form: either
   * they typed in the slug field, or the track loaded carrying a real slug
   * from a previous save. Seed it with `slugIsOwned` when loading a track.
   */
  slugTouched?: boolean;
}

/**
 * True for a slug the form generated as a stand-in rather than one derived
 * from a real title. A sparse draft save writes `track-<n>` because the slug
 * column is NOT NULL and the admin hadn't typed a title yet.
 */
export function isPlaceholderTrackSlug(slug: string): boolean {
  return !slug || /^track-\d+$/.test(slug);
}

/**
 * True for a release slug the server generated as a stand-in. Matches the
 * `draft-` test in `publishedReleaseSchema` exactly, so the form keeps
 * syncing precisely the slugs that publishing would otherwise reject.
 */
export function isPlaceholderReleaseSlug(slug: string): boolean {
  return !slug || slug.startsWith("draft-");
}

/**
 * Seed for `slugTouched` when loading a saved track: a real slug is the
 * admin's (or an earlier save's) and must not be rewritten, while a
 * placeholder is the form's own filler and is fair game to keep syncing.
 */
export function slugIsOwned(slug: string): boolean {
  return !isPlaceholderTrackSlug(slug);
}

/**
 * The slug to show when a saved record loads. A placeholder is replaced with
 * one derived from the name straight away, rather than waiting for the admin
 * to edit a field that may already be correct — otherwise the form displays
 * `track-1` (or `draft-a1b2c3d4`) next to a perfectly good title, and
 * publishing later rejects it for being auto-generated.
 */
export function healPlaceholderSlug(
  stored: string,
  name: string,
  isPlaceholder: (slug: string) => boolean,
): string {
  if (!isPlaceholder(stored)) return stored;
  return slugify(name) || stored;
}

/**
 * Whether the form should keep this track's slug mirroring its name.
 *
 * Deliberately independent of the *current* slug value. An earlier version
 * asked "is the slug still a placeholder?" on every keystroke, which latched:
 * typing the first letter of the artist rewrote `track-1` to `p-track-1`,
 * that no longer looked like a placeholder, and every later keystroke was
 * frozen out. Ownership is a property of the track, not of whatever the slug
 * happens to say mid-edit.
 */
export function shouldSyncSlug(
  track: TrackSlugState,
  releasePublished: boolean,
): boolean {
  if (track.slugTouched) return false;
  // Never saved — there's no URL to protect yet.
  if (track.existingId == null) return true;
  // Saved and live: the slug is a public URL, so it's frozen.
  return !releasePublished;
}

/** The slug a track should carry after its artist/title changed. */
export function nextTrackSlug(
  track: TrackSlugState,
  name: string,
  releasePublished: boolean,
): string {
  return shouldSyncSlug(track, releasePublished) ? slugify(name) : track.slug;
}

/**
 * The slug to persist for a track. Applies the same rule as `nextTrackSlug`,
 * so a draft saved before its title was filled in heals on the next save
 * rather than only when the admin happens to retype the title. The trailing
 * fallback keeps the column non-null for a sparse draft — which is what
 * writes `track-<n>` in the first place.
 */
export function slugToPersist(
  track: TrackSlugState,
  name: string,
  releasePublished: boolean,
): string {
  return (
    nextTrackSlug(track, name, releasePublished) ||
    slugify(name) ||
    `track-${track.trackNumber}`
  );
}

/** An image type the presign endpoint accepts, with its canonical extension. */
export interface ArtUploadType {
  mime: string;
  ext: string;
}

// Matched loosely because the `format` on a WAV's embedded picture isn't
// reliably a canonical MIME type, while the presign endpoint's allowlist
// rejects anything that isn't — so normalize before uploading.
const ART_TYPES: Array<{ match: RegExp } & ArtUploadType> = [
  { match: /png/i, mime: "image/png", ext: "png" },
  { match: /webp/i, mime: "image/webp", ext: "webp" },
  { match: /jpe?g/i, mime: "image/jpeg", ext: "jpg" },
];

/**
 * Normalize an embedded picture's declared format to a type the presign
 * endpoint accepts, or null when it's something we can't store as-is.
 */
export function artUploadTypeFor(format: string): ArtUploadType | null {
  const match = ART_TYPES.find((t) => t.match.test(format));
  return match ? { mime: match.mime, ext: match.ext } : null;
}

/**
 * Read a response body as JSON, tolerating the plain-text bodies the platform
 * returns for failures it handles before our code runs — a 413 from the
 * request-size limit, a 504 from a timeout. `res.json()` on those throws an
 * opaque `Unexpected token 'R'` SyntaxError that buries the real status.
 */
export async function readJsonBody(
  res: Response,
): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      error: `${text.slice(0, 120).trim() || "Request failed"} (${res.status})`,
    };
  }
}
