import { describe, it, expect } from "vitest";
import { getReleaseBySlug, getTrackByReleaseAndSlug } from "@/lib/release-reads";
import { makeRelease, makeTrackWithFile } from "../factories";

describe("getReleaseBySlug", () => {
  it("returns the published release with its tracks and files", async () => {
    const release = await makeRelease({ slug: "night-drive", name: "Night Drive" });
    await makeTrackWithFile(release.id, { name: "B Side", trackNumber: 2 });
    await makeTrackWithFile(release.id, { name: "A Side", trackNumber: 1 });

    const found = await getReleaseBySlug("night-drive");
    expect(found?.id).toBe(release.id);
    expect(found?.tracks.map((t) => t.name)).toEqual(["A Side", "B Side"]);
    expect(found?.tracks[0].files).toHaveLength(1);
  });

  it("returns null for an unpublished release", async () => {
    await makeRelease({ slug: "draft-only", isPublished: false });
    expect(await getReleaseBySlug("draft-only")).toBeNull();
  });

  it("returns null for a slug that does not exist", async () => {
    expect(await getReleaseBySlug("no-such-release")).toBeNull();
  });

  // The bug this replaced: a lookup that missed while the catalog was
  // unreachable cached `null` for an hour, so the release kept 404ing after the
  // data came back. Deriving from the catalog means a later read just sees it.
  it("sees a release published after an earlier miss for the same slug", async () => {
    expect(await getReleaseBySlug("late-arrival")).toBeNull();
    const release = await makeRelease({ slug: "late-arrival" });
    expect((await getReleaseBySlug("late-arrival"))?.id).toBe(release.id);
  });
});

describe("getTrackByReleaseAndSlug", () => {
  it("returns the track with its files and parent release", async () => {
    const release = await makeRelease({ slug: "night-drive", name: "Night Drive" });
    const track = await makeTrackWithFile(release.id, {
      name: "A Side",
      slug: "a-side",
      trackNumber: 1,
    });

    const found = await getTrackByReleaseAndSlug("night-drive", "a-side");
    expect(found?.id).toBe(track.id);
    expect(found?.files).toHaveLength(1);
    expect(found?.release.name).toBe("Night Drive");
  });

  it("carries the sibling tracks on the release, in track order", async () => {
    const release = await makeRelease({ slug: "night-drive" });
    await makeTrackWithFile(release.id, { name: "Second", slug: "second", trackNumber: 2 });
    await makeTrackWithFile(release.id, { name: "First", slug: "first", trackNumber: 1 });

    const found = await getTrackByReleaseAndSlug("night-drive", "second");
    expect(found?.release.tracks.map((t) => t.name)).toEqual(["First", "Second"]);
  });

  it("returns null for an unknown track slug on a real release", async () => {
    const release = await makeRelease({ slug: "night-drive" });
    await makeTrackWithFile(release.id, { slug: "a-side" });
    expect(await getTrackByReleaseAndSlug("night-drive", "b-side")).toBeNull();
  });

  it("returns null when the parent release is unpublished", async () => {
    const release = await makeRelease({ slug: "draft-only", isPublished: false });
    await makeTrackWithFile(release.id, { slug: "a-side" });
    expect(await getTrackByReleaseAndSlug("draft-only", "a-side")).toBeNull();
  });
});
