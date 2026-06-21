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
 * into one DB round-trip per request, and in `unstable_cache` so repeat
 * visitors hit the in-memory cache layer.
 *
 * `@gigamusic/db.getReleaseBySlug` is intentionally unfiltered on
 * `isPublished` (admins need to fetch drafts too); the public-only filter is
 * applied here so unpublished releases never leak into the music pages.
 */
export const getReleaseBySlug = cache(
  unstable_cache(
    (slug: string) =>
      loggedCacheRead(`getReleaseBySlug(${slug})`, () =>
        withDbRetry(async () => {
          const release = await queries.getReleaseBySlug(slug);
          return release?.isPublished ? release : null;
        }),
      ),
    ["release-by-slug-v1"],
    { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);

/**
 * Single track by (release slug, track slug). Same React-cache + unstable_cache
 * pattern as `getReleaseBySlug` so `generateMetadata` and the page body share
 * one DB round-trip. Returns the track with its files and parent release
 * (including sibling tracks) for the song page.
 */
export const getTrackByReleaseAndSlug = cache(
  unstable_cache(
    (releaseSlug: string, trackSlug: string) =>
      loggedCacheRead(`getTrackByReleaseAndSlug(${releaseSlug}, ${trackSlug})`, () =>
        withDbRetry(() => queries.getTrackByReleaseAndSlug(releaseSlug, trackSlug)),
      ),
    ["track-by-release-and-slug-v1"],
    { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
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
