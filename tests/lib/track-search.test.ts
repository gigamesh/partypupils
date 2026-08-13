import { describe, it, expect } from "vitest";
import { buildTrackSearchIndex, searchTracks } from "@/lib/track-search";

const releases = [
  {
    id: 1,
    name: "Love Will Find A Way",
    slug: "love-will-find-a-way",
    coverImageUrl: "https://cdn.test/cover.jpg",
    tracks: [
      {
        id: 10,
        name: "Party Pupils - Love Will Find A Way (Party Pupils Remix)",
        artist: "Party Pupils",
        slug: "love-will-find-a-way-party-pupils-remix",
        price: 199,
        trackNumber: 1,
        files: [{ format: "mp3", storageKey: "https://cdn.test/1.mp3" }],
      },
    ],
  },
  {
    id: 2,
    name: "Sunrise",
    slug: "sunrise",
    coverImageUrl: null,
    tracks: [
      {
        id: 20,
        name: "Sunrise (Café Mix)",
        artist: null,
        slug: "sunrise-cafe-mix",
        price: 149,
        trackNumber: 1,
        files: [],
      },
      {
        id: 21,
        name: "Midnight",
        artist: "Guest DJ",
        slug: "midnight",
        price: 149,
        trackNumber: 2,
        files: [{ format: "wav", storageKey: "https://cdn.test/21.wav" }],
      },
    ],
  },
];

const index = buildTrackSearchIndex(releases);

describe("buildTrackSearchIndex", () => {
  it("flattens every track and attaches a player track only when an mp3 exists", () => {
    expect(index).toHaveLength(3);
    expect(index[0].playerTrack?.streamUrl).toBe("https://cdn.test/1.mp3");
    expect(index[1].playerTrack).toBeNull();
    expect(index[2].playerTrack).toBeNull();
  });

  it("carries the parent release onto each entry", () => {
    expect(index[2].release).toMatchObject({ id: 2, name: "Sunrise", slug: "sunrise" });
  });
});

describe("searchTracks", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchTracks(index, "")).toEqual([]);
    expect(searchTracks(index, "   ")).toEqual([]);
  });

  it("matches case-insensitively on the track name", () => {
    expect(searchTracks(index, "MIDNIGHT").map((r) => r.track.id)).toEqual([21]);
  });

  it("matches on the artist even when the name does not contain it", () => {
    expect(searchTracks(index, "guest dj").map((r) => r.track.id)).toEqual([21]);
  });

  it("matches on the release name", () => {
    expect(searchTracks(index, "sunrise").map((r) => r.track.id)).toEqual([20, 21]);
  });

  it("requires every term but ignores their order", () => {
    expect(searchTracks(index, "remix love").map((r) => r.track.id)).toEqual([10]);
    expect(searchTracks(index, "remix midnight")).toEqual([]);
  });

  it("ignores punctuation and diacritics on both sides", () => {
    expect(searchTracks(index, "cafe").map((r) => r.track.id)).toEqual([20]);
    expect(searchTracks(index, "(Café Mix)").map((r) => r.track.id)).toEqual([20]);
  });

  it("ranks a track-name hit above a release-name-only hit", () => {
    expect(searchTracks(index, "sunrise")[0].track.id).toBe(20);
  });
});
