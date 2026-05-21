/**
 * Shape validation for the release admin form.
 *
 * Two schemas, picked based on the user's intent expressed by `isPublished`:
 *
 *   - `draftReleaseSchema` — only `name` is required. Everything else is
 *     optional and gets sentinel defaults via `applyDraftDefaults` before
 *     persistence. Lets admins gradually build a release out.
 *   - `publishedReleaseSchema` — strict floor: real slug, price > 0, at least
 *     one track, each track has name + artist + price > 0 + a WAV file.
 *
 * Storage logic stays in `release-tracks.ts`; this module only validates
 * shape and supplies defaults.
 */
import { z } from "zod";
import { randomBytes } from "node:crypto";

const fileSchema = z.object({
  format: z.string().min(1),
  fileName: z.string().min(1),
  storageKey: z.string().min(1),
  fileSize: z.number().int().nonnegative().optional(),
});

const draftFileSchema = fileSchema;

const draftTrackSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
  artist: z.string().nullish(),
  genre: z.string().nullish(),
  slug: z.string().optional(),
  price: z.number().int().nonnegative().optional(),
  trackNumber: z.number().int().positive(),
  inRadio: z.boolean().optional(),
  files: z.array(draftFileSchema).optional(),
});

const publishedTrackSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Track title is required"),
  artist: z.string().trim().min(1, "Artist is required"),
  genre: z.string().nullish(),
  slug: z.string().optional(),
  price: z.number().int().gt(0, "Track price must be greater than 0"),
  trackNumber: z.number().int().positive(),
  inRadio: z.boolean().optional(),
  files: z
    .array(fileSchema)
    .refine(
      (files) => files.some((f) => f.format === "wav"),
      "A WAV file is required",
    ),
});

const releaseTypeSchema = z.enum(["album", "single"]);

export const draftReleaseSchema = z.object({
  name: z.string().trim().min(1, "Release name is required"),
  slug: z.string().optional(),
  description: z.string().nullish(),
  price: z.number().int().nonnegative().optional(),
  type: releaseTypeSchema.optional(),
  coverImageUrl: z.string().nullish(),
  releasedAt: z.union([z.string(), z.date()]).nullish(),
  isPublished: z.literal(false),
  inRadio: z.boolean().optional(),
  tracks: z.array(draftTrackSchema).optional(),
});

export const publishedReleaseSchema = z.object({
  name: z.string().trim().min(1, "Release name is required"),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .refine(
      (s) => !s.startsWith("draft-"),
      "Slug is still auto-generated — set a real one before publishing",
    ),
  description: z.string().nullish(),
  price: z.number().int().gt(0, "Release price must be greater than 0"),
  type: releaseTypeSchema,
  coverImageUrl: z.string().nullish(),
  releasedAt: z.union([z.string(), z.date()]).nullish(),
  isPublished: z.literal(true),
  inRadio: z.boolean().optional(),
  tracks: z.array(publishedTrackSchema).min(1, "At least one track is required"),
});

export type DraftReleasePayload = z.infer<typeof draftReleaseSchema>;
export type PublishedReleasePayload = z.infer<typeof publishedReleaseSchema>;
export type ReleasePayload = DraftReleasePayload | PublishedReleasePayload;

export interface FieldErrorMap {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
}

export type ValidationResult =
  | { ok: true; data: ReleasePayload }
  | { ok: false; errors: FieldErrorMap };

/**
 * Pick the strict or lax schema by inspecting the payload's `isPublished` flag.
 * Returns a flat field-error map suitable for inline display on the form.
 */
export function validateReleasePayload(body: unknown): ValidationResult {
  const wantsPublished =
    typeof body === "object" &&
    body !== null &&
    (body as { isPublished?: unknown }).isPublished === true;

  const schema = wantsPublished ? publishedReleaseSchema : draftReleaseSchema;
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: flattenZodErrors(parsed.error) };
}

/** Same as `validateReleasePayload` but caller asserts the published shape. */
export function validatePublishedRelease(body: unknown): ValidationResult {
  const parsed = publishedReleaseSchema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: flattenZodErrors(parsed.error) };
}

function flattenZodErrors(error: z.ZodError): FieldErrorMap {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path
      .map((p) => (typeof p === "number" ? `[${p}]` : String(p)))
      .join(".")
      .replace(/\.\[/g, "[");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors, formErrors };
}

/** Random hex suffix so two un-named drafts don't collide on the unique slug. */
export function generateDraftSlug(): string {
  return `draft-${randomBytes(4).toString("hex")}`;
}

/**
 * Fill in the columns the schema requires NOT NULL when the admin saved a
 * sparse draft. Idempotent: never overwrites an explicit value.
 */
export function applyDraftDefaults(payload: DraftReleasePayload) {
  const slug = payload.slug?.trim() ? payload.slug.trim() : generateDraftSlug();
  const price = payload.price ?? 0;
  const type = payload.type ?? "single";
  const tracks = (payload.tracks ?? []).map((t, i) => ({
    ...t,
    name: t.name?.trim() || `Track ${t.trackNumber ?? i + 1}`,
    artist: t.artist ?? null,
    slug: t.slug,
    price: t.price ?? 0,
    inRadio: t.inRadio ?? true,
    files: t.files ?? [],
  }));
  return {
    ...payload,
    slug,
    price,
    type,
    tracks,
  };
}
