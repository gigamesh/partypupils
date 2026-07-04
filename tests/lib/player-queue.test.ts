import { describe, it, expect } from "vitest";
import {
  advanceQueue,
  buildInitialQueue,
  reconcileSource,
  retreatQueue,
  HISTORY_LIMIT,
  type MaterializedQueue,
} from "@/lib/player-data";
import type { PlayerTrack, RepeatMode } from "@/lib/player-types";

function makeTracks(n: number): PlayerTrack[] {
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
 * Drives the pure queue engine exactly the way AudioProvider's nextImpl/prevImpl
 * do, so the transitions can be exercised as a unit.
 */
class Player {
  history: PlayerTrack[];
  current: PlayerTrack | null;
  upNext: PlayerTrack[];
  source: PlayerTrack[];

  constructor(
    source: PlayerTrack[],
    public shuffle = true,
    public repeat: RepeatMode = "all",
    startIndex = 0,
  ) {
    const built = buildInitialQueue(source, startIndex, shuffle);
    this.history = built.history;
    this.current = built.current;
    this.upNext = built.upNext;
    this.source = source;
  }

  private apply(q: MaterializedQueue) {
    this.history = q.history;
    this.current = q.current;
    this.upNext = q.upNext;
  }

  /** Returns the trackId moved to, or null at a hard end-of-queue. */
  next(): number | null {
    const q = advanceQueue(
      { history: this.history, current: this.current, upNext: this.upNext, source: this.source },
      this.shuffle,
      this.repeat,
    );
    if (!q) return null;
    this.apply(q);
    return this.current!.trackId;
  }

  /** Returns the trackId moved to, or null when there is no earlier track. */
  prev(): number | null {
    const q = retreatQueue({ history: this.history, current: this.current, upNext: this.upNext });
    if (!q) return null;
    this.apply(q);
    return this.current!.trackId;
  }

  refresh(newSource: PlayerTrack[]) {
    const { upNext, source } = reconcileSource(this.upNext, newSource);
    this.upNext = upNext;
    this.source = source;
  }
}

describe("buildInitialQueue", () => {
  it("shuffle mode: current is the start track, the rest are the up-next, history empty", () => {
    const src = makeTracks(10);
    const q = buildInitialQueue(src, 0, true);
    expect(q.current).toBe(src[0]);
    expect(q.history).toEqual([]);
    expect(new Set([q.current!.trackId, ...q.upNext.map((t) => t.trackId)]).size).toBe(10);
  });

  it("order mode: tracks before the start index become history, tracks after become up-next", () => {
    const src = makeTracks(5);
    const q = buildInitialQueue(src, 2, false);
    expect(q.history.map((t) => t.trackId)).toEqual([1, 2]);
    expect(q.current!.trackId).toBe(3);
    expect(q.upNext.map((t) => t.trackId)).toEqual([4, 5]);
  });

  it("returns an empty timeline for an empty source", () => {
    expect(buildInitialQueue([], 0, true)).toEqual({ history: [], current: null, upNext: [] });
  });
});

describe("advanceQueue / retreatQueue reversibility", () => {
  it("forward then back returns to the exact track just heard", () => {
    const p = new Player(makeTracks(10));
    const first = p.current!.trackId;
    const second = p.next()!;
    expect(second).not.toBe(first);
    expect(p.prev()).toBe(first);
  });

  it("back then forward retraces the same track instead of drawing a new one", () => {
    const p = new Player(makeTracks(10));
    const a = p.current!.trackId;
    const b = p.next()!;
    const c = p.next()!;
    expect(p.prev()).toBe(b);
    expect(p.prev()).toBe(a);
    expect(p.next()).toBe(b);
    expect(p.next()).toBe(c);
  });

  it("is fully reversible across a long walk, including cycle wraps", () => {
    const p = new Player(makeTracks(15));
    const forward: number[] = [p.current!.trackId];
    for (let i = 0; i < 40; i++) forward.push(p.next()!); // > 2 full cycles

    const rewind: number[] = [p.current!.trackId];
    let step = p.prev();
    while (step !== null) {
      rewind.push(step);
      step = p.prev();
    }
    expect(rewind).toEqual([...forward].reverse());

    const replay: number[] = [p.current!.trackId];
    for (let i = 0; i < 40; i++) replay.push(p.next()!);
    expect(replay).toEqual(forward);
  });

  it("prev at the start of history has nothing to return to", () => {
    const p = new Player(makeTracks(10));
    expect(p.prev()).toBeNull();
    expect(p.current!.trackId).toBe(1);
  });
});

describe("shuffle no-repeat guarantees", () => {
  it("plays every track once per cycle (aligned blocks are permutations)", () => {
    const p = new Player(makeTracks(10));
    const heard = [p.current!.trackId];
    for (let i = 0; i < 10 * 5 - 1; i++) heard.push(p.next()!);
    for (let start = 0; start + 10 <= heard.length; start += 10) {
      expect(new Set(heard.slice(start, start + 10)).size).toBe(10);
    }
  });

  it("never repeats a track back-to-back, including across the cycle wrap", () => {
    const p = new Player(makeTracks(12));
    const heard = [p.current!.trackId];
    for (let i = 0; i < 12 * 3; i++) heard.push(p.next()!);
    for (let i = 1; i < heard.length; i++) {
      expect(heard[i]).not.toBe(heard[i - 1]);
    }
  });

  it("loops a single-track source under repeat-all without stalling", () => {
    const p = new Player(makeTracks(1));
    expect(p.next()).toBe(1);
    expect(p.next()).toBe(1);
  });
});

describe("order mode & repeat", () => {
  it("plays the source in order", () => {
    const p = new Player(makeTracks(4), false, "off");
    const heard = [p.current!.trackId];
    for (let i = 0; i < 3; i++) heard.push(p.next()!);
    expect(heard).toEqual([1, 2, 3, 4]);
  });

  it("stops at the end when repeat is off", () => {
    const p = new Player(makeTracks(3), false, "off");
    p.next();
    p.next();
    expect(p.next()).toBeNull();
  });

  it("wraps to the top when repeat is all", () => {
    const p = new Player(makeTracks(3), false, "all");
    p.next();
    p.next();
    expect(p.next()).toBe(1);
  });
});

describe("reconcileSource (radio refresh)", () => {
  it("drops pulled tracks from up-next but leaves current and history untouched", () => {
    const p = new Player(makeTracks(8));
    const a = p.current!.trackId;
    p.next();
    const removed = p.upNext[0].trackId;
    const newSource = p.source.filter((t) => t.trackId !== removed);
    p.refresh(newSource);
    expect(p.upNext.some((t) => t.trackId === removed)).toBe(false);
    expect(p.history[0].trackId).toBe(a); // history intact
    expect(p.upNext.every((t) => newSource.some((s) => s.trackId === t.trackId))).toBe(true);
  });

  it("surfaces newly added tracks at the next cycle wrap", () => {
    const src = makeTracks(3);
    const p = new Player(src, true, "all");
    p.next();
    p.next(); // up-next now empty; end of the first cycle
    const grown = [...src, ...makeTracks(4).slice(3)]; // adds track 4
    p.refresh(grown);
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) seen.add(p.next()!);
    expect(seen.has(4)).toBe(true);
  });

  it("keeps navigation reversible after a mid-cycle reshuffle of the same tracks", () => {
    const p = new Player(makeTracks(8));
    const a = p.current!.trackId;
    const b = p.next()!;
    const c = p.next()!;
    p.refresh([...p.source].reverse()); // same tracks, different array order
    expect(p.prev()).toBe(b);
    expect(p.prev()).toBe(a);
    expect(p.next()).toBe(b);
    expect(p.next()).toBe(c);
  });
});

describe("history bound", () => {
  it("never retains more than HISTORY_LIMIT entries", () => {
    const p = new Player(makeTracks(20));
    for (let i = 0; i < HISTORY_LIMIT * 2; i++) p.next();
    expect(p.history.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
});
