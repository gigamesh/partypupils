import { z } from "zod";

/**
 * Member ids for one bundle. Two is the floor for a bundle to mean anything,
 * and the ceiling keeps the Stripe `amounts` metadata value (~12 chars per
 * member) under Stripe's 500-char-per-value cap.
 */
const memberIds = (noun: string) =>
  z
    .array(z.number().int().positive())
    .min(2, `Pick at least 2 ${noun}`)
    .max(40, `A bundle can hold at most 40 ${noun}`)
    .refine((ids) => new Set(ids).size === ids.length, `Duplicate ${noun}`);

const bundleFields = {
  // Generated with crypto.randomUUID() by the admin editor. Stable across
  // renames so a bundle sitting in someone's cart survives an edit.
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  // Capped below 100 so a bundle can never price below the Stripe card minimum
  // for any realistic catalog.
  discountPercent: z.number().int().min(0).max(95),
  published: z.boolean(),
};

/** A pack of whole releases. */
export const ReleaseBundleSchema = z.object({
  ...bundleFields,
  kind: z.literal("releases"),
  releaseIds: memberIds("releases"),
});

/** A pack of individual songs, drawn from anywhere in the catalog. */
export const TrackBundleSchema = z.object({
  ...bundleFields,
  kind: z.literal("tracks"),
  trackIds: memberIds("songs"),
});

/**
 * A bundle holds releases or songs, never both. Keeping the two apart is what
 * lets the card copy, the cart's coverage rules and the Stripe line item each
 * speak about one kind of thing.
 *
 * A discriminated union (rather than one object with two optional id lists)
 * also keeps the editor's per-field error paths intact — a plain `z.union`
 * collapses them into a single union-level issue.
 */
export const BundleSchema = z.preprocess(
  // Bundles authored before singles bundles existed have no `kind`. They're
  // release bundles by construction, so stamp it rather than failing the parse
  // and taking every stored bundle off the storefront at once.
  (value) =>
    typeof value === "object" && value !== null && !("kind" in value)
      ? { ...value, kind: "releases" }
      : value,
  z.discriminatedUnion("kind", [ReleaseBundleSchema, TrackBundleSchema]),
);

export const BundlesConfigSchema = z
  .object({
    // Array order is display order — the editor's up/down buttons reorder it.
    bundles: z.array(BundleSchema).max(20),
  })
  .refine(
    (config) => new Set(config.bundles.map((b) => b.id)).size === config.bundles.length,
    "Duplicate bundle ids",
  );

export type ReleaseBundle = z.infer<typeof ReleaseBundleSchema>;
export type TrackBundle = z.infer<typeof TrackBundleSchema>;
export type Bundle = ReleaseBundle | TrackBundle;
export type BundleKind = Bundle["kind"];
export type BundlesConfig = z.infer<typeof BundlesConfigSchema>;

export const EMPTY_BUNDLES_CONFIG: BundlesConfig = { bundles: [] };

/** The member ids of a bundle, whichever kind it holds. */
export function bundleMemberIds(bundle: Bundle): number[] {
  return bundle.kind === "tracks" ? bundle.trackIds : bundle.releaseIds;
}

/** Replace a bundle's member ids without having to know which kind it holds. */
export function withMemberIds(bundle: Bundle, ids: number[]): Bundle {
  return bundle.kind === "tracks"
    ? { ...bundle, trackIds: ids }
    : { ...bundle, releaseIds: ids };
}

/** Switch a bundle between kinds, dropping the members that no longer apply. */
export function withKind(bundle: Bundle, kind: BundleKind): Bundle {
  if (bundle.kind === kind) return bundle;
  const { id, name, description, discountPercent, published } = bundle;
  const common = { id, name, description, discountPercent, published };
  return kind === "tracks"
    ? { ...common, kind: "tracks", trackIds: [] }
    : { ...common, kind: "releases", releaseIds: [] };
}

/** Singular/plural noun for a bundle's members — "3 songs", "1 release". */
export function memberNoun(kind: BundleKind, count: number): string {
  const noun = kind === "tracks" ? "song" : "release";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
