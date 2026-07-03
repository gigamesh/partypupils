import { describe, it, expect } from "vitest";
import { pickNextShuffleTrack } from "@/lib/player-data";
import type { PlayerTrack } from "@/lib/player-types";

function makeQueue(n: number): PlayerTrack[] {
  return Array.from({ length: n }, (_, i) => ({
    trackId: i + 1,
    trackName: `Track ${i + 1}`,
    trackSlug: `track-${i + 1}`,
    trackNumber: i + 1,
    releaseId: 1,
    releaseName: "Release",
    releaseSlug: "release",
    coverImageUrl: null,
    streamUrl: `https://r2/track-${i + 1}.mp3`,
  }));
}

/** Walk the shuffle bag for `steps` picks, returning the trackId heard at each step. */
function playSequence(queue: PlayerTrack[], startIndex: number, steps: number): number[] {
  let played = [queue[startIndex].trackId];
  let currentTrackId = queue[startIndex].trackId;
  const heard: number[] = [currentTrackId];
  for (let i = 0; i < steps; i++) {
    const pick = pickNextShuffleTrack(queue, played, currentTrackId);
    if (!pick) break;
    played = pick.playedTrackIds;
    currentTrackId = queue[pick.index].trackId;
    heard.push(currentTrackId);
  }
  return heard;
}

describe("pickNextShuffleTrack", () => {
  it("plays every track exactly once before repeating (a full cycle is a permutation)", () => {
    const queue = makeQueue(20);
    const heard = playSequence(queue, 0, queue.length - 1);
    expect(heard).toHaveLength(queue.length);
    expect(new Set(heard).size).toBe(queue.length);
  });

  it("never repeats a track back-to-back, including across the cycle wrap", () => {
    const queue = makeQueue(12);
    // Play three full cycles' worth of transitions.
    const heard = playSequence(queue, 3, queue.length * 3);
    for (let i = 1; i < heard.length; i++) {
      expect(heard[i]).not.toBe(heard[i - 1]);
    }
  });

  it("covers every track once per cycle across many cycles", () => {
    const queue = makeQueue(10);
    const heard = playSequence(queue, 0, queue.length * 5 - 1);
    // Each consecutive window of `length` picks should be a full permutation.
    for (let start = 0; start + queue.length <= heard.length; start += queue.length) {
      const window = heard.slice(start, start + queue.length);
      expect(new Set(window).size).toBe(queue.length);
    }
  });

  it("stays repeat-free even when the queue is re-shuffled mid-cycle", () => {
    // Simulates maybeRefreshRadioQueue swapping the array order between picks;
    // the bag keys on trackId, so ordering churn must not resurface a played track.
    let queue = makeQueue(15);
    let played = [queue[0].trackId];
    let currentTrackId = queue[0].trackId;
    const heard = new Set<number>([currentTrackId]);
    for (let i = 0; i < queue.length - 1; i++) {
      // Rotate the array to emulate a fresh shuffle with the same tracks.
      queue = [...queue.slice(1), queue[0]];
      const pick = pickNextShuffleTrack(queue, played, currentTrackId);
      expect(pick).not.toBeNull();
      const id = queue[pick!.index].trackId;
      expect(heard.has(id)).toBe(false);
      heard.add(id);
      played = pick!.playedTrackIds;
      currentTrackId = id;
    }
    expect(heard.size).toBe(queue.length);
  });

  it("returns index 0 for a single-track queue and null for an empty queue", () => {
    expect(pickNextShuffleTrack(makeQueue(1), [1], 1)).toEqual({ index: 0, playedTrackIds: [1] });
    expect(pickNextShuffleTrack([], [], null)).toBeNull();
  });
});
