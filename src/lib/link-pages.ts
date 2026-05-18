import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "./db";
import { LINK_PAGES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

/**
 * Public link page by slug. Includes visible items (ordered) and the
 * optionally-linked release so the cover image / title can fall back.
 * Returns null for missing or unpublished pages.
 */
export const getPublicLinkPageBySlug = cache(
  unstable_cache(
    (slug: string) =>
      prisma.linkPage.findFirst({
        where: { slug, isPublished: true },
        include: {
          release: true,
          items: {
            where: { isVisible: true },
            orderBy: { position: "asc" },
          },
        },
      }),
    ["public-link-page-by-slug-v1"],
    { tags: [LINK_PAGES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);
