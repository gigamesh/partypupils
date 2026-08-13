import { unstable_cache } from "next/cache";
import { cache } from "react";
import { loggedCacheRead, withDbRetry } from "@gigamusic/db";
import { queries } from "./db";
import { LINKS_TAG, RELEASES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

/**
 * Featured releases for the homepage (latest 4 published, with tracks + files).
 * Cached on the `releases` tag so admin writes invalidate it.
 *
 * `@gigamusic/db.listPublishedReleases` returns the full published catalog
 * already ordered by `releasedAt desc`; the slice to four happens here so the
 * package stays agnostic of consumer-specific feature counts.
 */
export const getFeaturedReleases = unstable_cache(
  () =>
    loggedCacheRead("getFeaturedReleases", () =>
      withDbRetry(async () => (await queries.listPublishedReleases()).slice(0, 4)),
    ),
  ["featured-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

/** Full published catalog for /music. Same tag as featured. */
export const getPublishedReleases = unstable_cache(
  () =>
    loggedCacheRead("getPublishedReleases", () =>
      withDbRetry(() => queries.listPublishedReleases()),
    ),
  ["published-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

/**
 * Single release by slug, used by both `generateMetadata` and the page body.
 * Wrapped in React `cache()` so the metadata query and the page query collapse
 * into one round-trip per request.
 *
 * Resolved out of the cached published catalog rather than its own per-slug
 * `unstable_cache` entry. The old shape cached misses as hard as hits: a lookup
 * that ran while the DB was empty (or mid-deploy, or during a Neon hiccup)
 * pinned `null` for a full hour, so a release that plainly existed kept 404ing
 * until the tag was invalidated. Deriving from the list means a slug is only
 * ever absent because the catalog itself says so, and the two can't disagree.
 *
 * `@gigamusic/db.listPublishedReleases` and `.getReleaseBySlug` build rows with
 * the same `with` clause (tracks ordered by `trackNumber`, each with files), so
 * the object handed back here is identical to what the direct query returned.
 * The published-only filter is now inherent — drafts never enter the list.
 *
 * It also means an unknown slug costs zero DB queries: 404s are answered from
 * the cached catalog instead of waking Neon's compute for a row that isn't
 * there, which is the same reason these pages are ISR'd in the first place.
 */
export const getReleaseBySlug = cache(async (slug: string) => {
  const releases = await getPublishedReleases();
  return releases.find((release) => release.slug === slug) ?? null;
});

/**
 * Single track by (release slug, track slug). Derived from the same cached
 * catalog as `getReleaseBySlug`, for the same reasons, and returns the same
 * `{ ...track, release }` shape the direct query did — the song page reads
 * both the track and its sibling tracks off it.
 */
export const getTrackByReleaseAndSlug = cache(
  async (releaseSlug: string, trackSlug: string) => {
    const release = await getReleaseBySlug(releaseSlug);
    if (!release) return null;
    const track = release.tracks.find((t) => t.slug === trackSlug);
    if (!track) return null;
    return { ...track, release };
  },
);

/** Visible hero links — small list, but it's on the homepage so we cache it too. */
export const getHeroLinks = unstable_cache(
  () =>
    loggedCacheRead("getHeroLinks", () =>
      withDbRetry(() => queries.listVisibleLinks({ showOnHero: true })),
    ),
  ["hero-links-v1"],
  { tags: [LINKS_TAG], revalidate: REVALIDATE_SECONDS },
);

/**
 * All visible links (ordered by position) for the standalone `/links` page.
 * Tagged on `LINKS_TAG` so admin link edits invalidate it immediately; the
 * page previously read the DB raw on every render, which kept Neon's compute
 * from ever auto-suspending.
 */
export const getVisibleLinks = unstable_cache(
  () =>
    loggedCacheRead("getVisibleLinks", () =>
      withDbRetry(() => queries.listVisibleLinks()),
    ),
  ["visible-links-v1"],
  { tags: [LINKS_TAG], revalidate: REVALIDATE_SECONDS },
);
