import { describe, it, expect } from "vitest";
import {
  applyDraftDefaults,
  draftReleaseSchema,
  generateDraftSlug,
  publishedReleaseSchema,
  validateReleaseFormState,
  validateReleasePayload,
  type ReleaseFormState,
} from "@/lib/release-validation";

describe("draftReleaseSchema", () => {
  it("accepts a payload with name + cover", () => {
    const result = draftReleaseSchema.safeParse({
      name: "Test",
      coverImageUrl: "https://r2/cover.jpg",
      isPublished: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing cover image", () => {
    const result = draftReleaseSchema.safeParse({ name: "Test", isPublished: false });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = draftReleaseSchema.safeParse({ name: "  ", isPublished: false });
    expect(result.success).toBe(false);
  });

  it("rejects isPublished:true", () => {
    const result = draftReleaseSchema.safeParse({ name: "Test", isPublished: true });
    expect(result.success).toBe(false);
  });
});

describe("publishedReleaseSchema", () => {
  const baseValid = {
    name: "Release",
    slug: "release",
    price: 1000,
    type: "single" as const,
    coverImageUrl: "https://r2/cover.jpg",
    isPublished: true as const,
    tracks: [
      {
        name: "Track",
        artist: "Artist",
        price: 200,
        trackNumber: 1,
        files: [
          { format: "wav", fileName: "t.wav", storageKey: "https://r2/t.wav", fileSize: 100 },
        ],
      },
    ],
  };

  it("accepts a valid payload", () => {
    expect(publishedReleaseSchema.safeParse(baseValid).success).toBe(true);
  });

  it("rejects a missing cover image", () => {
    const { coverImageUrl: _omit, ...withoutCover } = baseValid;
    void _omit;
    const r = publishedReleaseSchema.safeParse(withoutCover);
    expect(r.success).toBe(false);
  });

  it("rejects empty track artist", () => {
    const bad = {
      ...baseValid,
      tracks: [{ ...baseValid.tracks[0], artist: "" }],
    };
    const r = publishedReleaseSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "tracks.0.artist")).toBe(true);
    }
  });

  it("rejects a slug that's still auto-generated", () => {
    const r = publishedReleaseSchema.safeParse({ ...baseValid, slug: "draft-abcd1234" });
    expect(r.success).toBe(false);
  });

  it("rejects zero tracks", () => {
    const r = publishedReleaseSchema.safeParse({ ...baseValid, tracks: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a track with only an mp3 file", () => {
    const r = publishedReleaseSchema.safeParse({
      ...baseValid,
      tracks: [
        {
          ...baseValid.tracks[0],
          files: [
            { format: "mp3", fileName: "t.mp3", storageKey: "https://r2/t.mp3", fileSize: 100 },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejects price <= 0", () => {
    const r = publishedReleaseSchema.safeParse({ ...baseValid, price: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects track price <= 0", () => {
    const r = publishedReleaseSchema.safeParse({
      ...baseValid,
      tracks: [{ ...baseValid.tracks[0], price: 0 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("validateReleasePayload (schema router)", () => {
  it("picks the draft schema when isPublished is false", () => {
    const r = validateReleasePayload({
      name: "x",
      coverImageUrl: "https://r2/c.jpg",
      isPublished: false,
    });
    expect(r.ok).toBe(true);
  });

  it("picks the published schema when isPublished is true", () => {
    const r = validateReleasePayload({ name: "x", isPublished: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Strict floor demands slug, price, type, tracks — expect multiple field errors.
      expect(Object.keys(r.errors.fieldErrors).length).toBeGreaterThan(1);
    }
  });

  it("returns a flat field-error map keyed by dotted path", () => {
    const r = validateReleasePayload({
      name: "x",
      slug: "ok",
      price: 100,
      type: "single",
      isPublished: true,
      tracks: [
        { name: "t", artist: "", price: 100, trackNumber: 1, files: [] },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.fieldErrors["tracks[0].artist"]).toBeDefined();
      expect(r.errors.fieldErrors["tracks[0].files"]).toBeDefined();
    }
  });
});

describe("applyDraftDefaults", () => {
  it("auto-generates a draft- slug when blank", () => {
    const out = applyDraftDefaults({ name: "Untitled", coverImageUrl: "https://r2/cover.jpg", isPublished: false });
    expect(out.slug).toMatch(/^draft-[a-f0-9]+$/);
  });

  it("preserves an explicit slug", () => {
    const out = applyDraftDefaults({ name: "x", slug: "my-slug", coverImageUrl: "https://r2/cover.jpg", isPublished: false });
    expect(out.slug).toBe("my-slug");
  });

  it("defaults price=0 and type=single", () => {
    const out = applyDraftDefaults({ name: "x", coverImageUrl: "https://r2/cover.jpg", isPublished: false });
    expect(out.price).toBe(0);
    expect(out.type).toBe("single");
  });

  it("fills empty track names with `Track <n>`", () => {
    const out = applyDraftDefaults({
      name: "x",
      coverImageUrl: "https://r2/cover.jpg",
      isPublished: false,
      tracks: [{ trackNumber: 2 }],
    });
    expect(out.tracks[0].name).toBe("Track 2");
  });
});

describe("generateDraftSlug", () => {
  it("returns a unique-looking draft- prefix", () => {
    const a = generateDraftSlug();
    const b = generateDraftSlug();
    expect(a).toMatch(/^draft-[a-f0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe("validateReleaseFormState (client-side pre-flight)", () => {
  const validPublishedState: ReleaseFormState = {
    name: "Release",
    slug: "release",
    description: "",
    priceCents: 1000,
    type: "single",
    coverImageUrl: "https://r2/cover.jpg",
    releasedAt: null,
    isPublished: true,
    inRadio: true,
    tracks: [
      {
        name: "Artist - Title",
        artist: "Artist",
        genre: "",
        slug: "artist-title",
        priceCents: 200,
        trackNumber: 1,
        inRadio: true,
        hasNewWav: true,
        hasExistingWav: false,
      },
    ],
  };

  it("accepts a complete published-release state with a freshly-picked WAV", () => {
    const result = validateReleaseFormState(validPublishedState);
    expect(result.ok).toBe(true);
  });

  it("accepts a track that has no new WAV but does have an existing one", () => {
    const result = validateReleaseFormState({
      ...validPublishedState,
      tracks: [
        {
          ...validPublishedState.tracks[0],
          hasNewWav: false,
          hasExistingWav: true,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a track that has neither a new nor existing WAV (the screenshot bug)", () => {
    const result = validateReleaseFormState({
      ...validPublishedState,
      tracks: [
        {
          ...validPublishedState.tracks[0],
          hasNewWav: false,
          hasExistingWav: false,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fieldErrors["tracks[0].files"]).toBeDefined();
    }
  });

  it("rejects a track with an empty artist when publishing", () => {
    const result = validateReleaseFormState({
      ...validPublishedState,
      tracks: [{ ...validPublishedState.tracks[0], artist: "" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fieldErrors["tracks[0].artist"]).toBeDefined();
    }
  });

  it("rejects a release with priceCents <= 0 when publishing", () => {
    const result = validateReleaseFormState({ ...validPublishedState, priceCents: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fieldErrors.price).toBeDefined();
    }
  });

  it("accepts a draft state with sparse fields (cover still required)", () => {
    const result = validateReleaseFormState({
      name: "Untitled",
      slug: "",
      description: "",
      priceCents: 0,
      type: "single",
      coverImageUrl: "https://r2/cover.jpg",
      releasedAt: null,
      isPublished: false,
      inRadio: true,
      tracks: [],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a draft state with no cover image", () => {
    const result = validateReleaseFormState({
      name: "Untitled",
      slug: "",
      description: "",
      priceCents: 0,
      type: "single",
      coverImageUrl: null,
      releasedAt: null,
      isPublished: false,
      inRadio: true,
      tracks: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fieldErrors.coverImageUrl).toBeDefined();
    }
  });

  it("returns multiple structured errors at once for a multi-issue published state", () => {
    const result = validateReleaseFormState({
      ...validPublishedState,
      priceCents: 0,
      tracks: [
        {
          ...validPublishedState.tracks[0],
          artist: "",
          priceCents: 0,
          hasNewWav: false,
          hasExistingWav: false,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fieldErrors.price).toBeDefined();
      expect(result.errors.fieldErrors["tracks[0].artist"]).toBeDefined();
      expect(result.errors.fieldErrors["tracks[0].price"]).toBeDefined();
      expect(result.errors.fieldErrors["tracks[0].files"]).toBeDefined();
    }
  });
});
