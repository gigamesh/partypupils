/**
 * The ceilings here aren't policy — they're derived from the 500 MB of `/tmp`
 * a Vercel Function gets, which every server-side path that touches a whole
 * audio file runs through. These tests pin the arithmetic so a future change
 * to either limit is a deliberate one.
 */
import { describe, it, expect } from "vitest";
import {
  AUDIO_UPLOAD_LIMITS,
  formatBytes,
  oversizeAudioMessage,
} from "@/lib/upload-limits";

const MB = 1024 * 1024;

describe("AUDIO_UPLOAD_LIMITS", () => {
  it("keeps the WAV ceiling under what transcode's 2.23x /tmp write allows", () => {
    // source + tagged copy + ~23% mp3, against 500 MB.
    expect(AUDIO_UPLOAD_LIMITS.wav * 2.23).toBeLessThan(500 * MB);
  });

  it("keeps the MP3 ceiling under what the retag's 2x /tmp round-trip allows", () => {
    expect(AUDIO_UPLOAD_LIMITS.mp3 * 2).toBeLessThanOrEqual(500 * MB);
  });

  it("allows a ~100 minute mix at 320kbps", () => {
    const bytesPerMinute = (320_000 / 8) * 60;
    expect(AUDIO_UPLOAD_LIMITS.mp3 / bytesPerMinute).toBeGreaterThan(100);
  });
});

describe("oversizeAudioMessage", () => {
  it("returns null for a file at the limit", () => {
    expect(oversizeAudioMessage("t.wav", AUDIO_UPLOAD_LIMITS.wav, "wav")).toBeNull();
  });

  it("names the size, the limit and the format when over", () => {
    const msg = oversizeAudioMessage("t.wav", 300 * MB, "wav");
    expect(msg).toContain("300 MB");
    expect(msg).toContain("200 MB");
    expect(msg).toContain("WAV");
  });

  it("points an oversized WAV at the MP3-only escape hatch", () => {
    expect(oversizeAudioMessage("t.wav", 300 * MB, "wav")).toMatch(/MP3 instead/);
  });

  it("does not suggest MP3 to a file that is already an MP3", () => {
    const msg = oversizeAudioMessage("mix.mp3", 300 * MB, "mp3");
    expect(msg).not.toMatch(/MP3 instead/);
    expect(msg).toMatch(/Split the mix/);
  });

  it("applies the per-format ceiling, not one shared number", () => {
    const size = 220 * MB;
    expect(oversizeAudioMessage("t.wav", size, "wav")).not.toBeNull();
    expect(oversizeAudioMessage("mix.mp3", size, "mp3")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("keeps sub-megabyte values legible for transfer rates", () => {
    expect(formatBytes(812 * 1024)).toBe("812 KB");
  });

  it("shows a decimal between 1 and 10 MB", () => {
    expect(formatBytes(3.4 * MB)).toBe("3.4 MB");
  });

  it("rounds to whole megabytes above 10 MB", () => {
    expect(formatBytes(240 * MB)).toBe("240 MB");
  });

  it("switches to gigabytes at 1 GB", () => {
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
  });
});
