import { z } from "zod";

export const BundleSchema = z.object({
  // Generated with crypto.randomUUID() by the admin editor. Stable across
  // renames so a bundle sitting in someone's cart survives an edit.
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  releaseIds: z
    .array(z.number().int().positive())
    // Two releases is the floor for a bundle to mean anything, and the ceiling
    // keeps the Stripe `amounts` metadata value (~12 chars per member) under
    // Stripe's 500-char-per-value cap.
    .min(2, "Pick at least 2 releases")
    .max(40, "A bundle can hold at most 40 releases")
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate releases"),
  // Capped below 100 so a bundle can never price below the Stripe card minimum
  // for any realistic catalog.
  discountPercent: z.number().int().min(0).max(95),
  published: z.boolean(),
});

export const BundlesConfigSchema = z
  .object({
    // Array order is display order — the editor's up/down buttons reorder it.
    bundles: z.array(BundleSchema).max(20),
  })
  .refine(
    (config) => new Set(config.bundles.map((b) => b.id)).size === config.bundles.length,
    "Duplicate bundle ids",
  );

export type Bundle = z.infer<typeof BundleSchema>;
export type BundlesConfig = z.infer<typeof BundlesConfigSchema>;

export const EMPTY_BUNDLES_CONFIG: BundlesConfig = { bundles: [] };
