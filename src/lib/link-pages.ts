import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createLinkPageQueries } from "@gigamusic/links";
import type { PrismaClient as GigamusicPrismaClient } from "@gigamusic/db";
import { prisma } from "./db";
import { LINK_PAGES_TAG } from "./cache-tags";

const REVALIDATE_SECONDS = 3600;

export const linkPageQueries = createLinkPageQueries(
  prisma as unknown as GigamusicPrismaClient,
);

export const getPublicLinkPageBySlug = cache(
  unstable_cache(
    (slug: string) => linkPageQueries.getPublicLinkPageBySlug(slug),
    ["public-link-page-by-slug-v2"],
    { tags: [LINK_PAGES_TAG], revalidate: REVALIDATE_SECONDS },
  ),
);
