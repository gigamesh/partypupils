/**
 * Shape validation for the release admin form.
 *
 * Two schemas, picked based on the user's intent expressed by `isPublished`:
 *
 *   - `draftReleaseSchema` — `name` and `coverImageUrl` are required (the cover
 *     is mandatory because the save-time retag embeds it into every track file;
 *     a coverless save would strip existing art). Everything else is optional
 *     and gets sentinel defaults via `applyDraftDefaults` before persistence.
 *     Lets admins gradually build a release out.
 *   - `publishedReleaseSchema` — strict floor: real slug, price > 0, at least
 *     one track, each track has name + artist + price > 0 + an audio file
 *     (WAV or MP3 — see `AUDIO_FORMATS`).
 *
 * Storage logic stays in `release-tracks.ts`; this module only validates
 * shape and supplies defaults.
 */
import { z } from "zod";

/**
 * Stand-in for an asset the form is about to upload but hasn't yet. The schemas
 * only check that these fields are non-empty strings, never that they resolve,
 * so the placeholder is enough to let the pre-flight pass.
 */
const PENDING_UPLOAD = "pending://upload";

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

/**
 * Formats that satisfy the published-track audio requirement. WAV is the
 * lossless master a normal release ships; MP3 alone is accepted so DJ mixes —
 * which are bounced straight to 320kbps and never transcoded server-side — can
 * be published. `hasWavMaster` below flags the MP3-only case for the UI so an
 * admin doesn't ship a normal release without its master by accident.
 */
const AUDIO_FORMATS = ["wav", "mp3"] as const;

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
      (files) =>
        files.some((f) =>
          (AUDIO_FORMATS as readonly string[]).includes(f.format),
        ),
      "An audio file is required",
    ),
});

const releaseTypeSchema = z.enum(["album", "single"]);

export const draftReleaseSchema = z.object({
  name: z.string().trim().min(1, "Release name is required"),
  slug: z.string().optional(),
  description: z.string().nullish(),
  price: z.number().int().nonnegative().optional(),
  type: releaseTypeSchema.optional(),
  coverImageUrl: z.string().trim().min(1, "A cover image is required"),
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
  coverImageUrl: z.string().trim().min(1, "A cover image is required"),
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

/**
 * Random hex suffix so two un-named drafts don't collide on the unique slug.
 * Uses the Web Crypto API so this module stays importable from both server
 * code (route handlers) and client code (the admin form's pre-flight check).
 */
export function generateDraftSlug(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `draft-${hex}`;
}

/**
 * Form-state projection used by `validateReleaseFormState`. Mirrors the
 * subset of `ReleaseForm.tsx` state the validator needs: the user-typed
 * scalars plus, per track, which audio formats will be present after upload
 * (`newAudioFormat` for a freshly-picked File, `existingAudioFormats` for keys
 * already persisted on the existing release).
 */
export interface ReleaseFormState {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  type: "album" | "single";
  /** Cover already persisted on the existing release, or null on a new one. */
  coverImageUrl: string | null;
  /** True when the user has selected a fresh cover File not yet uploaded. */
  hasNewCover: boolean;
  releasedAt: string | null;
  isPublished: boolean;
  inRadio: boolean;
  tracks: Array<{
    existingId?: number;
    /** Combined "Artist - Title" form, e.g. what gets stored as `track.name`. */
    name: string;
    artist: string;
    genre: string;
    /** Slug as already saved, or empty if the form will auto-derive one. */
    slug: string;
    priceCents: number;
    trackNumber: number;
    inRadio: boolean;
    /** Format of a freshly-selected audio File not uploaded yet, or null. */
    newAudioFormat: AudioFormat | null;
    /** Formats already persisted for this track on an existing release. */
    existingAudioFormats: AudioFormat[];
  }>;
}

/** Audio formats a track can ship. */
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

/**
 * Indices of tracks that will publish without a lossless WAV master. Valid —
 * the schema accepts MP3-only tracks so mixes can ship — but worth surfacing
 * in the form, since for a normal release it almost always means the admin
 * picked the wrong file.
 */
export function tracksMissingWavMaster(state: ReleaseFormState): number[] {
  return state.tracks.flatMap((t, i) => {
    const hasAudio = t.newAudioFormat != null || t.existingAudioFormats.length > 0;
    const hasWav =
      t.newAudioFormat === "wav" || t.existingAudioFormats.includes("wav");
    return hasAudio && !hasWav ? [i] : [];
  });
}

/**
 * Client-side pre-flight: validate the form's current state against the same
 * server schema *before* any uploads begin. Lets the form fail fast on
 * missing scalars (artist, title, slug, price) and on tracks that lack any
 * audio — historically the form only learned about these failures after
 * minutes of waiting for transcoding to finish on the server round-trip.
 *
 * Projects the form state into the API body shape, substituting a placeholder
 * `pending://upload` storage key for assets that will be uploaded but don't
 * exist yet — both per-track audio and the release cover. The schemas only
 * check for presence (an entry whose `format` is in `AUDIO_FORMATS`, a
 * non-empty cover string) and never that the URL resolves, so the placeholder
 * short-circuits the spurious "missing audio" / "missing cover" errors that
 * would otherwise fire on a new release where nothing has been uploaded at
 * submit time yet.
 */
export function validateReleaseFormState(state: ReleaseFormState): ValidationResult {
  const body = projectFormStateToApiBody(state);
  return validateReleasePayload(body);
}

function projectFormStateToApiBody(state: ReleaseFormState): unknown {
  return {
    name: state.name,
    slug: state.slug,
    description: state.description || null,
    price: state.priceCents,
    type: state.type,
    coverImageUrl: state.hasNewCover ? PENDING_UPLOAD : state.coverImageUrl,
    releasedAt: state.releasedAt,
    isPublished: state.isPublished,
    inRadio: state.inRadio,
    tracks: state.tracks.map((t) => ({
      id: t.existingId,
      name: t.name,
      artist: t.artist || null,
      genre: t.genre || null,
      slug: t.slug,
      price: t.priceCents,
      trackNumber: t.trackNumber,
      inRadio: t.inRadio,
      files: filesForTrack(t.newAudioFormat, t.existingAudioFormats),
    })),
  };
}

function filesForTrack(
  newAudioFormat: AudioFormat | null,
  existingAudioFormats: AudioFormat[],
) {
  const formats = new Set<AudioFormat>(existingAudioFormats);
  if (newAudioFormat) formats.add(newAudioFormat);
  return Array.from(formats, (format) => ({
    format,
    fileName: `pending.${format}`,
    storageKey: PENDING_UPLOAD,
  }));
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
