import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createQueries } from "@gigamusic/db";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma, withDbRetry } from "./db";
import { LINKS_TAG, RELEASES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

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

export const getFeaturedReleases = unstable_cache(
  () =>
    loggedCacheRead("getFeaturedReleases", () =>
      withDbRetry(async () => (await queries.listPublishedReleases()).slice(0, 4)),
    ),
  ["featured-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

export const getPublishedReleases = unstable_cache(
  () =>
    loggedCacheRead("getPublishedReleases", () =>
      withDbRetry(() => queries.listPublishedReleases()),
    ),
  ["published-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

// React `cache()` collapses the metadata + page-body queries into one
// per-request DB round-trip. The published-only re-filter is here because
// the underlying query intentionally returns drafts too (for admins).
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

export const getHeroLinks = unstable_cache(
  () =>
    loggedCacheRead("getHeroLinks", () =>
      withDbRetry(() => queries.listVisibleLinks({ showOnHero: true })),
    ),
  ["hero-links-v1"],
  { tags: [LINKS_TAG], revalidate: REVALIDATE_SECONDS },
);
