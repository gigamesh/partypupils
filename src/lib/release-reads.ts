import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma, withDbRetry } from "./db";
import { LINKS_TAG, RELEASES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

// Party-pupils' Prisma client is generated to src/generated/prisma but is
// structurally compatible with the one @gigamusic/db expects.
const queries = createQueries(prisma as unknown as GigamusicPrismaClient);

/**
 * Wraps a cached database read so the unwrapped error makes it into the
 * runtime logs. When the inner operation throws (typically `withDbRetry`
 * exhausting its retries against a dropped Neon socket), Next.js's
 * `unstable_cache` revalidation path stringifies the failure as
 * `ErrorEvent {type:'error',...}` — stack and cause stripped. Catching
 * here and logging before re-throwing preserves the diagnostics without
 * changing behaviour: Next.js still sees the throw and still emits its
 * own log line, ours just has the actual stack and `err.cause`.
 */
async function loggedCacheRead<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const detail = err instanceof Error ? err.stack || err.message : String(err);
    const causeRaw = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
    const cause = causeRaw
      ? `\n  cause: ${causeRaw instanceof Error ? causeRaw.stack || causeRaw.message : String(causeRaw)}`
      : "";
    console.error(`[cache:${label}] failed: ${detail}${cause}`);
    throw err;
  }
}

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
 *
 * Not in `@gigamusic/db`'s `Queries` surface — the package focuses on release-
 * and order-shaped reads, so this stays as a direct Prisma call.
 */
export const getTrackByReleaseAndSlug = cache(
  unstable_cache(
    (releaseSlug: string, trackSlug: string) =>
      loggedCacheRead(`getTrackByReleaseAndSlug(${releaseSlug}, ${trackSlug})`, () =>
        withDbRetry(() =>
          prisma.track.findFirst({
            where: {
              slug: trackSlug,
              release: { slug: releaseSlug, isPublished: true },
            },
            include: {
              files: true,
              release: {
                include: {
                  tracks: { orderBy: { trackNumber: "asc" }, include: { files: true } },
                },
              },
            },
          }),
        ),
      ),
    ["track-by-release-and-slug-v1"],
    { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);

/**
 * Visible hero links — small list, but it's on the homepage so we cache it too.
 *
 * `@gigamusic/db.listVisibleLinks` filters on `isVisible` only; the extra
 * `showOnHero` predicate is party-pupils-specific (hero vs. footer placement)
 * so the filter stays here on top of the package read.
 */
export const getHeroLinks = unstable_cache(
  () =>
    loggedCacheRead("getHeroLinks", () =>
      withDbRetry(async () => {
        const links = await queries.listVisibleLinks();
        return links.filter((link) => link.showOnHero);
      }),
    ),
  ["hero-links-v1"],
  { tags: [LINKS_TAG], revalidate: REVALIDATE_SECONDS },
);
