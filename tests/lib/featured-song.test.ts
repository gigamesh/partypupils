/**
 * The featured song is a single stored track id resolved against the published
 * catalog at render time. The properties that matter are the degradations: an
 * unset, malformed, deleted or unpublished pick must leave `/music` without a
 * card rather than break it.
 */
import { describe, it, expect } from "vitest";
import { findFeaturedSong, getFeaturedSongTrackId } from "@/lib/featured-song";
import { queries } from "@/lib/db";
import { FEATURED_SONG_KEY } from "@/lib/constants";
import { buildTrackSearchIndex } from "@/lib/track-search";
import { makeRelease, makeTrackWithFile } from "../factories";

const index = buildTrackSearchIndex([
  {
    id: 1,
    name: "Sunrise",
    slug: "sunrise",
    coverImageUrl: null,
    tracks: [
      {
        id: 10,
        name: "Sunrise (Café Mix)",
        artist: null,
        slug: "sunrise-cafe-mix",
        price: 149,
        trackNumber: 1,
        files: [{ format: "mp3", storageKey: "https://cdn.test/10.mp3" }],
      },
    ],
  },
]);

describe("getFeaturedSongTrackId", () => {
  it("returns null when nothing is featured", async () => {
    expect(await getFeaturedSongTrackId()).toBeNull();
  });

  it("reads back the stored track id", async () => {
    const release = await makeRelease();
    const track = await makeTrackWithFile(release.id);
    await queries.setSetting(FEATURED_SONG_KEY, String(track.id));

    expect(await getFeaturedSongTrackId()).toBe(track.id);
  });

  it("treats the empty-string sentinel as nothing featured", async () => {
    await queries.setSetting(FEATURED_SONG_KEY, "");
    expect(await getFeaturedSongTrackId()).toBeNull();
  });

  it("degrades to null on a non-numeric value", async () => {
    await queries.setSetting(FEATURED_SONG_KEY, "not-a-track");
    expect(await getFeaturedSongTrackId()).toBeNull();
  });
});

describe("findFeaturedSong", () => {
  it("returns null when no song is featured", () => {
    expect(findFeaturedSong(index, null)).toBeNull();
  });

  it("resolves the featured track out of the catalog index", () => {
    const featured = findFeaturedSong(index, 10);
    expect(featured?.track.name).toBe("Sunrise (Café Mix)");
    expect(featured?.release.slug).toBe("sunrise");
    expect(featured?.playerTrack?.streamUrl).toBe("https://cdn.test/10.mp3");
  });

  it("returns null when the featured track is no longer in the published catalog", () => {
    expect(findFeaturedSong(index, 999)).toBeNull();
  });
});
