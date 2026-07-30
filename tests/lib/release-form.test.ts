/**
 * The pure helpers behind `ReleaseForm.tsx` — the slug rules and the two
 * spots where a real save went wrong in production:
 *
 *   - a track stuck on its `track-1` placeholder slug because the freeze
 *     rule (which protects published URLs) also applied to a draft that had
 *     never been published
 *   - `res.json()` on a plain-text platform error, which surfaced a 413 as
 *     "Unexpected token 'R', "Request En"... is not valid JSON"
 */
import { describe, it, expect } from "vitest";
import {
  artUploadTypeFor,
  healPlaceholderSlug,
  isPlaceholderReleaseSlug,
  isPlaceholderTrackSlug,
  nextTrackSlug,
  readJsonBody,
  shouldSyncSlug,
  slugIsOwned,
  slugToPersist,
  type TrackSlugState,
} from "@/lib/release-form";
import { combinedName } from "@/lib/track-name";

const PUBLISHED = true;
const UNPUBLISHED = false;

/**
 * A track as the form holds it. Omit `existingId` for a not-yet-saved track.
 * `slugTouched` defaults the way the form seeds it — from the slug itself.
 */
function track(overrides: Partial<TrackSlugState> = {}): TrackSlugState {
  const base = { existingId: 1, slug: "some-slug", trackNumber: 1, ...overrides };
  return { slugTouched: slugIsOwned(base.slug), ...base };
}

/**
 * Replay typing into a form field one character at a time, threading the slug
 * through exactly as the change handler does. Single-call assertions can't see
 * a rule that latches on its own output — which is how `p-track-1` shipped.
 */
function typeInto(
  start: TrackSlugState,
  field: "artist" | "title",
  text: string,
  other: string,
  releasePublished = UNPUBLISHED,
): string {
  let state = { ...start };
  let typed = "";
  for (const ch of text) {
    typed += ch;
    const name =
      field === "artist" ? combinedName(typed, other) : combinedName(other, typed);
    state = { ...state, slug: nextTrackSlug(state, name, releasePublished) };
  }
  return state.slug;
}

describe("isPlaceholderTrackSlug", () => {
  it("treats an empty slug and `track-<n>` as placeholders", () => {
    expect(isPlaceholderTrackSlug("")).toBe(true);
    expect(isPlaceholderTrackSlug("track-1")).toBe(true);
    expect(isPlaceholderTrackSlug("track-12")).toBe(true);
  });

  it("treats a derived slug as real, including ones that merely start with `track`", () => {
    expect(isPlaceholderTrackSlug("love-will-find-a-way")).toBe(false);
    expect(isPlaceholderTrackSlug("track-of-the-year")).toBe(false);
    expect(isPlaceholderTrackSlug("tracks-1")).toBe(false);
  });
});

describe("isPlaceholderReleaseSlug", () => {
  it("matches the server-generated draft slug", () => {
    expect(isPlaceholderReleaseSlug("draft-a1b2c3d4")).toBe(true);
    expect(isPlaceholderReleaseSlug("")).toBe(true);
  });

  it("treats a real release slug as owned", () => {
    expect(isPlaceholderReleaseSlug("yacht-house-summer-vol-3")).toBe(false);
  });

  it("agrees with the publish guard, so the form syncs exactly what publishing rejects", async () => {
    const { validateReleasePayload } = await import("@/lib/release-validation");
    const publishable = {
      name: "Yacht House Summer Vol. 3",
      slug: "draft-a1b2c3d4",
      price: 999,
      type: "album",
      coverImageUrl: "https://cdn/cover.jpg",
      releasedAt: new Date().toISOString(),
      isPublished: true,
      inRadio: true,
      tracks: [
        {
          name: "Party Pupils - Love Will Find A Way",
          artist: "Party Pupils",
          slug: "love-will-find-a-way",
          price: 199,
          trackNumber: 1,
          inRadio: true,
          files: [{ format: "wav", fileName: "t.wav", storageKey: "https://r2/t.wav" }],
        },
      ],
    };
    const result = validateReleasePayload(publishable);
    expect(result.ok).toBe(false);
    expect(isPlaceholderReleaseSlug(publishable.slug)).toBe(true);
  });
});

describe("slugIsOwned", () => {
  it("treats a real stored slug as the admin's, a placeholder as the form's", () => {
    expect(slugIsOwned("love-will-find-a-way")).toBe(true);
    expect(slugIsOwned("track-1")).toBe(false);
    expect(slugIsOwned("")).toBe(false);
  });
});

/**
 * Load-time healing. Without this the form displays `track-1` (or
 * `draft-a1b2c3d4`) next to a perfectly good title, because the sync only
 * fires on a keystroke — and the admin has no reason to retype a field that
 * already reads correctly. For the release slug that's not cosmetic:
 * publishing rejects a `draft-` slug outright.
 */
describe("healPlaceholderSlug", () => {
  const trackPlaceholder = (s: string) => !slugIsOwned(s);

  it("replaces a track placeholder with one derived from the name", () => {
    expect(
      healPlaceholderSlug("track-1", "Party Pupils - Love Will Find A Way", trackPlaceholder),
    ).toBe("party-pupils-love-will-find-a-way");
  });

  it("replaces a draft release slug with one derived from the name", () => {
    expect(
      healPlaceholderSlug("draft-a1b2c3d4", "Yacht House Summer Vol. 3", isPlaceholderReleaseSlug),
    ).toBe("yacht-house-summer-vol-3");
  });

  it("leaves a real slug untouched — it may already be a live URL", () => {
    expect(
      healPlaceholderSlug("love-will-find-a-way", "Something Else", trackPlaceholder),
    ).toBe("love-will-find-a-way");
    expect(
      healPlaceholderSlug("yacht-house-summer-vol-3", "Renamed", isPlaceholderReleaseSlug),
    ).toBe("yacht-house-summer-vol-3");
  });

  it("keeps the placeholder when the name yields nothing", () => {
    expect(healPlaceholderSlug("track-1", "", trackPlaceholder)).toBe("track-1");
    expect(healPlaceholderSlug("draft-a1b2", "!!!", isPlaceholderReleaseSlug)).toBe("draft-a1b2");
  });

  it("is idempotent across reloads", () => {
    const once = healPlaceholderSlug("track-1", "Love Will Find A Way", trackPlaceholder);
    expect(healPlaceholderSlug(once, "Love Will Find A Way", trackPlaceholder)).toBe(once);
  });
});

describe("shouldSyncSlug", () => {
  it("syncs a track that has never been saved", () => {
    expect(shouldSyncSlug(track({ existingId: undefined, slug: "" }), UNPUBLISHED)).toBe(true);
  });

  it("stops syncing once the admin owns the slug", () => {
    expect(shouldSyncSlug(track({ slug: "track-1", slugTouched: true }), UNPUBLISHED)).toBe(false);
    expect(
      shouldSyncSlug(track({ existingId: undefined, slug: "custom", slugTouched: true }), UNPUBLISHED),
    ).toBe(false);
  });

  it("never syncs a saved track on a published release", () => {
    expect(shouldSyncSlug(track({ slug: "track-1" }), PUBLISHED)).toBe(false);
  });

  it("ignores what the slug currently says — ownership is a property of the track", () => {
    // The regression: this must not flip to false just because a mid-edit
    // slug stopped looking like a placeholder.
    expect(shouldSyncSlug(track({ slug: "p-track-1", slugTouched: false }), UNPUBLISHED)).toBe(true);
  });
});

describe("nextTrackSlug", () => {
  it("derives freely for a track that hasn't been saved yet", () => {
    const t = track({ existingId: undefined, slug: "" });
    expect(nextTrackSlug(t, "Party Pupils - Love Will Find A Way", UNPUBLISHED)).toBe(
      "party-pupils-love-will-find-a-way",
    );
  });

  it("clears a new track's slug when its name is emptied, so it re-derives later", () => {
    const t = track({ existingId: undefined, slug: "old-slug", slugTouched: false });
    expect(nextTrackSlug(t, "", UNPUBLISHED)).toBe("");
  });

  it("freezes an existing track's real slug — it's a live URL", () => {
    const t = track({ slug: "love-will-find-a-way" });
    expect(nextTrackSlug(t, "Something Else Entirely", PUBLISHED)).toBe(
      "love-will-find-a-way",
    );
    expect(nextTrackSlug(t, "Something Else Entirely", UNPUBLISHED)).toBe(
      "love-will-find-a-way",
    );
  });

  it("heals a placeholder slug on an unpublished release (the reported bug)", () => {
    const t = track({ slug: "track-1" });
    expect(
      nextTrackSlug(t, "Love Will Find A Way (Party Pupils Remix)", UNPUBLISHED),
    ).toBe("love-will-find-a-way-party-pupils-remix");
  });

  it("heals an existing track whose slug was left empty", () => {
    const t = track({ slug: "" });
    expect(nextTrackSlug(t, "Love Will Find A Way", UNPUBLISHED)).toBe(
      "love-will-find-a-way",
    );
  });

  it("does NOT heal a placeholder once the release is published", () => {
    const t = track({ slug: "track-1" });
    expect(nextTrackSlug(t, "Love Will Find A Way", PUBLISHED)).toBe("track-1");
  });

  it("leaves an owned slug alone when the name is emptied", () => {
    expect(nextTrackSlug(track({ slug: "real-slug" }), "", UNPUBLISHED)).toBe("real-slug");
  });
});

/**
 * The `p-track-1` regression, end to end. An untitled draft save stores the
 * name as "Track 1", so the Title field reloads holding that filler while the
 * slug holds `track-1` — then the admin starts typing the artist.
 */
describe("nextTrackSlug across a whole typing session", () => {
  it("follows every keystroke instead of latching on the first one", () => {
    const loaded = track({ slug: "track-1" });
    expect(typeInto(loaded, "artist", "Party Pupils", "Track 1")).toBe(
      "party-pupils-track-1",
    );
  });

  it("ends on the full title when both fields are typed out", () => {
    let state = track({ slug: "track-1" });
    state = { ...state, slug: typeInto(state, "artist", "Party Pupils", "") };
    const finalSlug = typeInto(
      state,
      "title",
      "Love Will Find A Way",
      "Party Pupils",
    );
    expect(finalSlug).toBe("party-pupils-love-will-find-a-way");
  });

  it("does not produce the `p-track-1` shape at any point after typing settles", () => {
    const loaded = track({ slug: "track-1" });
    expect(typeInto(loaded, "artist", "P", "Track 1")).toBe("p-track-1");
    // ...but one more keystroke must move it on, not freeze it.
    expect(typeInto(loaded, "artist", "Pa", "Track 1")).toBe("pa-track-1");
    expect(typeInto(loaded, "artist", "Party", "Track 1")).toBe("party-track-1");
  });

  it("stays frozen through a typing session once the admin owns the slug", () => {
    const owned = track({ slug: "my-custom-slug", slugTouched: true });
    expect(typeInto(owned, "title", "Anything At All", "Party Pupils")).toBe(
      "my-custom-slug",
    );
  });

  it("stays frozen through a typing session on a published release", () => {
    const live = track({ slug: "track-1" });
    expect(typeInto(live, "artist", "Party Pupils", "Track 1", PUBLISHED)).toBe("track-1");
  });
});

describe("slugToPersist", () => {
  it("heals a placeholder on save without needing the title retyped", () => {
    const t = track({ slug: "track-1" });
    expect(slugToPersist(t, "Love Will Find A Way", UNPUBLISHED)).toBe(
      "love-will-find-a-way",
    );
  });

  it("keeps a published track's slug stable on save", () => {
    const t = track({ slug: "track-1" });
    expect(slugToPersist(t, "Love Will Find A Way", PUBLISHED)).toBe("track-1");
  });

  it("keeps an admin-owned slug on save", () => {
    const t = track({ slug: "b-side-version", slugTouched: true });
    expect(slugToPersist(t, "Love Will Find A Way", UNPUBLISHED)).toBe("b-side-version");
  });

  it("falls back to `track-<n>` when there's nothing to derive from", () => {
    const t = track({ existingId: undefined, slug: "", trackNumber: 3 });
    expect(slugToPersist(t, "", UNPUBLISHED)).toBe("track-3");
  });

  it("derives from the name for a brand-new track", () => {
    const t = track({ existingId: undefined, slug: "", trackNumber: 2 });
    expect(slugToPersist(t, "Party Pupils - Yacht House", UNPUBLISHED)).toBe(
      "party-pupils-yacht-house",
    );
  });

  it("is stable across repeated saves — a healed slug doesn't drift", () => {
    const healed = slugToPersist(track({ slug: "track-1" }), "Love Will Find A Way", UNPUBLISHED);
    const again = slugToPersist(
      track({ slug: healed }),
      "Love Will Find A Way",
      UNPUBLISHED,
    );
    expect(again).toBe(healed);
  });
});

describe("artUploadTypeFor", () => {
  it("passes through canonical image MIME types", () => {
    expect(artUploadTypeFor("image/jpeg")).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(artUploadTypeFor("image/png")).toEqual({ mime: "image/png", ext: "png" });
    expect(artUploadTypeFor("image/webp")).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("normalizes the non-canonical formats embedded pictures report", () => {
    // The presign allowlist only accepts canonical types, so "jpg"/"JPEG"
    // have to be mapped rather than forwarded as-is.
    expect(artUploadTypeFor("jpg")).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(artUploadTypeFor("JPEG")).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(artUploadTypeFor("PNG")).toEqual({ mime: "image/png", ext: "png" });
  });

  it("returns null for a type the presign endpoint would reject", () => {
    expect(artUploadTypeFor("image/bmp")).toBeNull();
    expect(artUploadTypeFor("image/gif")).toBeNull();
    expect(artUploadTypeFor("")).toBeNull();
  });
});

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    const res = new Response(JSON.stringify({ error: "Nope", fieldErrors: { slug: ["bad"] } }), {
      status: 400,
    });
    expect(await readJsonBody(res)).toEqual({
      error: "Nope",
      fieldErrors: { slug: ["bad"] },
    });
  });

  it("surfaces a plain-text 413 instead of a JSON parse error (the reported bug)", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    const body = await readJsonBody(res);
    expect(body.error).toBe("Request Entity Too Large (413)");
  });

  it("surfaces a plain-text gateway timeout", async () => {
    const res = new Response("An error occurred with your deployment", { status: 504 });
    expect(await readJsonBody(res)).toEqual({
      error: "An error occurred with your deployment (504)",
    });
  });

  it("handles an empty body", async () => {
    expect(await readJsonBody(new Response("", { status: 502 }))).toEqual({});
  });

  it("handles a whitespace-only body without producing a bare status", async () => {
    const body = await readJsonBody(new Response("   ", { status: 502 }));
    expect(body.error).toBe("Request failed (502)");
  });

  it("truncates a long HTML error page", async () => {
    const res = new Response("<html>" + "x".repeat(5000) + "</html>", { status: 500 });
    const error = (await readJsonBody(res)).error as string;
    expect(error.length).toBeLessThan(150);
    expect(error).toContain("(500)");
  });
});
