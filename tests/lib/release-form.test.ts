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
  isPlaceholderTrackSlug,
  nextTrackSlug,
  readJsonBody,
  slugToPersist,
  type TrackSlugState,
} from "@/lib/release-form";

const PUBLISHED = true;
const UNPUBLISHED = false;

/** A track as the form holds it. Omit `existingId` for a not-yet-saved track. */
function track(overrides: Partial<TrackSlugState> = {}): TrackSlugState {
  return { existingId: 1, slug: "some-slug", trackNumber: 1, ...overrides };
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

describe("nextTrackSlug", () => {
  it("derives freely for a track that hasn't been saved yet", () => {
    const t = track({ existingId: undefined, slug: "" });
    expect(nextTrackSlug(t, "Party Pupils - Love Will Find A Way", UNPUBLISHED)).toBe(
      "party-pupils-love-will-find-a-way",
    );
  });

  it("clears a new track's slug when its name is emptied, so it re-derives later", () => {
    const t = track({ existingId: undefined, slug: "old-slug" });
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

  it("never blanks an existing slug when the name is emptied", () => {
    expect(nextTrackSlug(track({ slug: "track-1" }), "", UNPUBLISHED)).toBe("track-1");
    expect(nextTrackSlug(track({ slug: "real-slug" }), "", UNPUBLISHED)).toBe(
      "real-slug",
    );
  });

  it("keeps the placeholder when the name has nothing sluggable in it", () => {
    expect(nextTrackSlug(track({ slug: "track-1" }), "!!!", UNPUBLISHED)).toBe(
      "track-1",
    );
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
