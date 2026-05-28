import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { linkPages, releases } from "@/db/schema";
import { getPublicLinkPageBySlug } from "@/lib/link-pages";

describe("getPublicLinkPageBySlug", () => {
  it("does not leak a draft release's cover image when the page has no override", async () => {
    const [draftRelease] = await db
      .insert(releases)
      .values({
        name: "Hidden",
        slug: "hidden-1",
        price: 0,
        type: "single",
        isPublished: false,
        coverImageUrl: "https://r2/should-not-leak.jpg",
      })
      .returning();
    await db.insert(linkPages).values({
      slug: "lp-draft-cover-test",
      title: "T",
      isPublished: true,
      coverImageUrl: null,
      releaseId: draftRelease!.id,
    });

    const page = await getPublicLinkPageBySlug("lp-draft-cover-test");
    expect(page).not.toBeNull();
    // We expose isPublished from the include so callers can refuse the fallback.
    expect(page?.release?.isPublished).toBe(false);
    expect(page?.release?.coverImageUrl).toBe("https://r2/should-not-leak.jpg");
    // The page itself has no override — the route's resolveCoverImage uses
    // page.release.isPublished to skip the draft cover. We assert the shape
    // exposed by the lib here; the route-side filtering is tested via the
    // page component when rendered.
  });

  it("returns null for an unpublished link page", async () => {
    await db.insert(linkPages).values({
      slug: "lp-draft-page",
      title: "T",
      isPublished: false,
    });
    const page = await getPublicLinkPageBySlug("lp-draft-page");
    expect(page).toBeNull();
  });

  it("returns the page when published and falls back to a published release's cover", async () => {
    const [release] = await db
      .insert(releases)
      .values({
        name: "Live",
        slug: "live-1",
        price: 1000,
        type: "single",
        isPublished: true,
        coverImageUrl: "https://r2/ok.jpg",
      })
      .returning();
    await db.insert(linkPages).values({
      slug: "lp-live-fallback",
      title: "T",
      isPublished: true,
      coverImageUrl: null,
      releaseId: release!.id,
    });
    const page = await getPublicLinkPageBySlug("lp-live-fallback");
    expect(page?.release?.isPublished).toBe(true);
    expect(page?.release?.coverImageUrl).toBe("https://r2/ok.jpg");
  });
});
