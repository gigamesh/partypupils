import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "./db";
import { RELEASES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

/**
 * Featured releases for the homepage (latest 4 published, with tracks + files).
 * Cached on the `releases` tag so admin writes invalidate it.
 */
export const getFeaturedReleases = unstable_cache(
  () =>
    prisma.release.findMany({
      where: { isPublished: true },
      orderBy: { releasedAt: "desc" },
      take: 4,
      include: {
        tracks: {
          orderBy: { trackNumber: "asc" },
          include: { files: true },
        },
      },
    }),
  ["featured-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

/** Full published catalog for /music. Same tag as featured. */
export const getPublishedReleases = unstable_cache(
  () =>
    prisma.release.findMany({
      where: { isPublished: true },
      orderBy: { releasedAt: "desc" },
      include: {
        tracks: {
          orderBy: { trackNumber: "asc" },
          include: { files: true },
        },
      },
    }),
  ["published-releases-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);

/**
 * Single release by slug, used by both `generateMetadata` and the page body.
 * Wrapped in React `cache()` so the metadata query and the page query collapse
 * into one DB round-trip per request, and in `unstable_cache` so repeat
 * visitors hit the in-memory cache layer.
 */
export const getReleaseBySlug = cache(
  unstable_cache(
    (slug: string) =>
      prisma.release.findUnique({
        where: { slug, isPublished: true },
        include: {
          tracks: {
            orderBy: { trackNumber: "asc" },
            include: { files: true },
          },
        },
      }),
    ["release-by-slug-v1"],
    { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);

/** Visible hero links — small list, but it's on the homepage so we cache it too. */
export const getHeroLinks = unstable_cache(
  () =>
    prisma.link.findMany({
      where: { isVisible: true, showOnHero: true },
      orderBy: { position: "asc" },
    }),
  ["hero-links-v1"],
  { tags: [RELEASES_TAG], revalidate: REVALIDATE_SECONDS },
);
