import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { db, queries } from "./db";
import { releases } from "@/db/schema";
import { RELEASES_TAG } from "./cache-tags";
import { BUNDLES_SETTING_KEY } from "./constants";
import {
  BundlesConfigSchema,
  EMPTY_BUNDLES_CONFIG,
  type BundlesConfig,
} from "./bundle-schema";
import { applyBundleDiscount } from "./pricing";

export interface BundleMember {
  id: number;
  name: string;
  slug: string;
  price: number;
  coverImageUrl: string | null;
}

export interface PricedBundle {
  id: string;
  name: string;
  description?: string;
  members: BundleMember[];
  releaseIds: number[];
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
}

/**
 * Read the raw admin-authored bundle config. Uncached — the admin page and the
 * admin write path both need to see their own writes immediately.
 *
 * A malformed row degrades to an empty config rather than throwing, so a bad
 * hand-edit takes bundles off the storefront instead of 500ing `/music`.
 */
export async function getBundlesConfig(): Promise<BundlesConfig> {
  // `getSetting` already JSON.parses the stored value.
  const raw = await queries.getSetting<unknown>(BUNDLES_SETTING_KEY);
  if (raw === null) return EMPTY_BUNDLES_CONFIG;

  const parsed = BundlesConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  console.error("[bundles] Stored bundle config failed schema validation", parsed.error);
  return EMPTY_BUNDLES_CONFIG;
}

/**
 * Resolve admin-defined bundles against the published catalog and price them.
 *
 * The release fetch is a lean projection for the same reason as
 * `getCatalogPrice` — routing it through `queries.listPublishedReleases` would
 * pull tracks + files on every `/music` render.
 *
 * Member ids that no longer resolve (deleted or unpublished releases) are
 * dropped silently: admins unpublish releases without revisiting bundles, and
 * that shouldn't break the page. A bundle left with fewer than two members
 * disappears entirely rather than rendering as a one-item "bundle".
 */
export const getPublishedBundles = unstable_cache(
  async (): Promise<PricedBundle[]> => {
    const [config, releaseRows] = await Promise.all([
      getBundlesConfig(),
      db
        .select({
          id: releases.id,
          name: releases.name,
          slug: releases.slug,
          price: releases.price,
          coverImageUrl: releases.coverImageUrl,
        })
        .from(releases)
        .where(eq(releases.isPublished, true)),
    ]);

    const releaseById = new Map(releaseRows.map((r) => [r.id, r]));

    return config.bundles.flatMap((bundle) => {
      if (!bundle.published) return [];

      // Preserve the admin-specified member order.
      const members = bundle.releaseIds
        .map((id) => releaseById.get(id))
        .filter((r): r is BundleMember => r !== undefined);
      if (members.length < 2) return [];

      const originalPrice = members.reduce((sum, m) => sum + m.price, 0);

      return [
        {
          id: bundle.id,
          name: bundle.name,
          description: bundle.description,
          members,
          releaseIds: members.map((m) => m.id),
          originalPrice,
          discountedPrice: applyBundleDiscount(originalPrice, bundle.discountPercent),
          discountPercent: bundle.discountPercent,
        },
      ];
    });
  },
  ["published-bundles-v1"],
  { tags: [RELEASES_TAG], revalidate: 3600 },
);

/**
 * Look up one bundle for checkout. Deliberately reads through
 * `getPublishedBundles` so the price the storefront shows and the price Stripe
 * charges can never diverge.
 */
export async function getBundleForCheckout(id: string): Promise<PricedBundle | undefined> {
  return (await getPublishedBundles()).find((b) => b.id === id);
}

/** Stripe line-item name for a bundle — what the customer sees on the receipt. */
export function bundleProductName(bundle: PricedBundle): string {
  const count = `${bundle.members.length} releases`;
  return bundle.discountPercent > 0
    ? `${bundle.name} (${count}, ${bundle.discountPercent}% off)`
    : `${bundle.name} (${count})`;
}
