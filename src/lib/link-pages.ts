import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createLinkPageQueries } from "@gigamusic/links";
import { db } from "./db";
import { LINK_PAGES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

// Singleton query helpers bound to the party-pupils Drizzle client. Exported so
// the admin route wrappers can hand the same instance to
// `@gigamusic/links/server`'s admin handler factories.
export const linkPageQueries = createLinkPageQueries(db);

/**
 * Public link page by slug. Includes visible items (ordered) and the
 * optionally-linked release so the cover image / title can fall back.
 * Returns null for missing or unpublished pages.
 */
export const getPublicLinkPageBySlug = cache(
  unstable_cache(
    (slug: string) => linkPageQueries.getPublicLinkPageBySlug(slug),
    ["public-link-page-by-slug-v2"],
    { tags: [LINK_PAGES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);
