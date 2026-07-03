import { describe, it, expect } from "vitest";
import { resolveShuffleNext, resolveShufflePrev } from "@/lib/player-data";
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

/**
 * Minimal re-implementation of the AudioProvider store's shuffle navigation so
 * the next/prev transitions can be exercised as a unit. Mirrors nextImpl/prevImpl.
 */
class Player {
  currentIndex: number;
  history: number[];
  historyIndex: number;
  playedTrackIds: number[];

  constructor(public queue: PlayerTrack[], startIndex = 0) {
    this.currentIndex = startIndex;
    const startId = queue[startIndex].trackId;
    this.history = [startId];
    this.historyIndex = 0;
    this.playedTrackIds = [startId];
  }

  get currentTrackId(): number {
    return this.queue[this.currentIndex].trackId;
  }

  next(): number | null {
    const pick = resolveShuffleNext(
      this.queue,
      this.history,
      this.historyIndex,
      this.playedTrackIds,
      this.currentTrackId,
    );
    if (!pick) return null;
    this.currentIndex = pick.index;
    this.history = pick.history;
    this.historyIndex = pick.historyIndex;
    this.playedTrackIds = pick.playedTrackIds;
    return this.currentTrackId;
  }

  /** Returns the trackId moved to, or null when there is no earlier track. */
  prev(): number | null {
    const pick = resolveShufflePrev(this.queue, this.history, this.historyIndex);
    if (!pick) return null;
    this.currentIndex = pick.index;
    this.historyIndex = pick.historyIndex;
    return this.currentTrackId;
  }
}

describe("shuffle back/forward navigation", () => {
  it("forward then back returns to the exact track just heard", () => {
    const p = new Player(makeQueue(10), 0);
    const first = p.currentTrackId;
    const second = p.next()!;
    expect(second).not.toBe(first);
    expect(p.prev()).toBe(first);
  });

  it("back then forward retraces the same track instead of drawing a new one", () => {
    const p = new Player(makeQueue(10), 0);
    const a = p.currentTrackId;
    const b = p.next()!;
    const c = p.next()!;
    // Walk all the way back to the start...
    expect(p.prev()).toBe(b);
    expect(p.prev()).toBe(a);
    // ...then forward again must reproduce the identical sequence.
    expect(p.next()).toBe(b);
    expect(p.next()).toBe(c);
  });

  it("prev at the start of history has nothing to return to", () => {
    const p = new Player(makeQueue(10), 0);
    expect(p.prev()).toBeNull();
    expect(p.historyIndex).toBe(0);
  });

  it("forward/back is fully reversible across a long walk", () => {
    const p = new Player(makeQueue(15), 0);
    const forward: number[] = [p.currentTrackId];
    for (let i = 0; i < 30; i++) forward.push(p.next()!);

    // Rewind to the very start, collecting the trackId at each step.
    const rewind: number[] = [p.currentTrackId];
    let step = p.prev();
    while (step !== null) {
      rewind.push(step);
      step = p.prev();
    }
    // Rewinding must reproduce the forward walk in exact reverse.
    expect(rewind).toEqual([...forward].reverse());

    // Replaying forward from the start reproduces the original walk exactly.
    const replay: number[] = [p.currentTrackId];
    for (let i = 0; i < 30; i++) replay.push(p.next()!);
    expect(replay).toEqual(forward);
  });

  it("extends history only at the tip; new picks are unplayed within the cycle", () => {
    const p = new Player(makeQueue(6), 0);
    const heard = [p.currentTrackId];
    for (let i = 0; i < 5; i++) heard.push(p.next()!);
    // A full cycle of 6 distinct tracks with no repeats, recorded in history.
    expect(new Set(heard).size).toBe(6);
    expect(p.history).toEqual(heard);
    expect(p.historyIndex).toBe(5);
  });

  it("survives a mid-cycle queue reshuffle (history keyed by trackId)", () => {
    const p = new Player(makeQueue(8), 0);
    const a = p.currentTrackId;
    const b = p.next()!;
    const c = p.next()!;
    expect(c).not.toBe(b);
    // Emulate maybeRefreshRadioQueue swapping in a re-ordered array of the same tracks.
    p.queue = [...p.queue].reverse();
    // Back-navigation still finds the real previously-heard tracks by id.
    expect(p.prev()).toBe(b);
    expect(p.prev()).toBe(a);
    expect(p.next()).toBe(b);
    expect(p.next()).toBe(c);
  });

  it("skips history entries whose track has left the queue", () => {
    const p = new Player(makeQueue(6), 0);
    const a = p.currentTrackId;
    const b = p.next()!;
    const c = p.next()!;
    // Track `b` is pulled from the radio between plays.
    p.queue = p.queue.filter((t) => t.trackId !== b);
    // Going back from c skips the now-absent b and lands on a.
    expect(p.prev()).toBe(a);
  });
});
