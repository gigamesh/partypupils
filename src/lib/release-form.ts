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
 * The slug a track should carry after its artist/title changed.
 *
 * An already-saved track's slug is normally frozen — it's the public
 * /music/<release>/<track> URL, and renaming it breaks every link to it. The
 * exception is a placeholder on a release that was never published: nothing
 * can be linking to that URL yet, and freezing it strands the track on
 * `track-1` no matter what the admin types afterwards.
 */
export function nextTrackSlug(
  track: TrackSlugState,
  name: string,
  releasePublished: boolean,
): string {
  const derived = slugify(name);
  if (track.existingId == null) return derived;
  const healable = isPlaceholderTrackSlug(track.slug) && !releasePublished;
  return derived && healable ? derived : track.slug;
}

/**
 * The slug to persist for a track. Applies the same placeholder rule as
 * `nextTrackSlug`, so a draft saved before its title was filled in heals on
 * the next save rather than only when the admin happens to retype the title.
 * The trailing fallback keeps the column non-null for a sparse draft — which
 * is what writes `track-<n>` in the first place.
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
