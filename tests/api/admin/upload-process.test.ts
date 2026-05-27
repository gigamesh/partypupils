/**
 * Tests for the WAV → MP3 transcoding route.
 *
 * The transcode is exercised against the real ffmpeg-static binary by piping a
 * tiny generated WAV (1s silence) through `convertWavStreamToMp3` directly —
 * the MP3 is written to a temp file (ffmpeg corrupts artwork-embedded MP3s
 * written to a pipe). The route handler is then tested with the storage layer
 * mocked — we just verify it wires GET→ffmpeg→PUT and surfaces errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { Readable } from "stream";
import { spawnSync } from "child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ffmpegStatic from "ffmpeg-static";
import { POST as processUpload } from "@/app/api/admin/upload/process/route";
import { convertWavStreamToMp3 } from "@/lib/preview";
import { getFileBuffer, uploadBuffer, uploadStream } from "@/lib/storage";

beforeEach(() => {
  vi.mocked(getFileBuffer).mockReset();
  vi.mocked(uploadBuffer).mockReset();
  vi.mocked(uploadStream).mockReset();
  vi.mocked(uploadBuffer).mockResolvedValue({
    url: "https://r2/stub",
    storageKey: "https://r2/stub",
  });
});

function jsonRequest(body: unknown): NextRequest {
  return new Request("http://test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Generate a 1-second silent WAV via the bundled ffmpeg binary. */
function generateSilentWav(): Buffer {
  if (!ffmpegStatic) throw new Error("ffmpeg-static missing for this platform");
  const result = spawnSync(
    ffmpegStatic,
    ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1", "-f", "wav", "pipe:1"],
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg setup failed: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

/** Generate a tiny PNG via the bundled ffmpeg binary, for cover-art tests. */
function generatePng(): Buffer {
  if (!ffmpegStatic) throw new Error("ffmpeg-static missing for this platform");
  const result = spawnSync(
    ffmpegStatic,
    ["-f", "lavfi", "-i", "color=c=red:s=16x16:d=1", "-frames:v", "1", "-c:v", "png", "-f", "image2pipe", "pipe:1"],
    { encoding: "buffer", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg png setup failed: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

/** Probe the MP3 buffer for ID3v2 frame text via ffprobe (bundled with ffmpeg-static). */
function readId3Tags(mp3: Buffer): Record<string, string> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static missing");
  const result = spawnSync(
    ffmpegStatic,
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "ffmetadata", "pipe:1"],
    { input: mp3, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  // ffmpeg prints ffmetadata on stdout; non-zero exit is still common with -f ffmetadata when no output streams exist.
  const text = result.stdout.toString();
  const tags: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m && m[1] !== ";FFMETADATA1") tags[m[1].toLowerCase()] = m[2];
  }
  return tags;
}

describe("convertWavStreamToMp3", () => {
  it("transcodes a small WAV stream to a non-empty MP3 file", async () => {
    const wav = generateSilentWav();
    const mp3Path = join(tmpdir(), `${randomUUID()}.mp3`);
    try {
      await convertWavStreamToMp3({
        wavStream: Readable.from(wav),
        mp3Path,
        bitrate: "320k",
      });
      const mp3 = await readFile(mp3Path);
      expect(mp3.length).toBeGreaterThan(0);
      // First three bytes of an MP3: either an ID3 tag or an MPEG sync (0xFF 0xFB/0xFA/0xF3/0xF2).
      const isId3 = mp3.toString("ascii", 0, 3) === "ID3";
      const isSync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
      expect(isId3 || isSync).toBe(true);
    } finally {
      await unlink(mp3Path).catch(() => {});
    }
  });

  it("embeds title/artist/album/track/date ID3v2 tags when metadata is supplied", async () => {
    const wav = generateSilentWav();
    const mp3Path = join(tmpdir(), `${randomUUID()}.mp3`);
    try {
      await convertWavStreamToMp3({
        wavStream: Readable.from(wav),
        mp3Path,
        bitrate: "320k",
        metadata: {
          title: "The Way It Is (Party Pupils Remix) Extended",
          artist: "Bruce Hornsby",
          album: "Yacht House Summer Vol 1",
          trackNumber: 15,
          trackTotal: 22,
          year: 2024,
        },
      });
      const mp3 = await readFile(mp3Path);
      expect(mp3.toString("ascii", 0, 3)).toBe("ID3");
      const tags = readId3Tags(mp3);
      expect(tags.title).toBe("The Way It Is (Party Pupils Remix) Extended");
      expect(tags.artist).toBe("Bruce Hornsby");
      expect(tags.album).toBe("Yacht House Summer Vol 1");
      expect(tags.track).toBe("15/22");
      expect(tags.date).toBe("2024");
      // Album Artist must never be written — it has to stay unpopulated.
      expect(tags.album_artist).toBeUndefined();
    } finally {
      await unlink(mp3Path).catch(() => {});
    }
  });

  it("embeds cover art into the MP3 when a coverPath is supplied", async () => {
    const wav = generateSilentWav();
    const coverPath = join(tmpdir(), `${randomUUID()}.png`);
    const mp3Path = join(tmpdir(), `${randomUUID()}.mp3`);
    try {
      await writeFile(coverPath, generatePng());
      await convertWavStreamToMp3({
        wavStream: Readable.from(wav),
        mp3Path,
        bitrate: "320k",
        coverPath,
      });
      const mp3 = await readFile(mp3Path);
      // ffmpeg lists input streams on stderr; an embedded cover shows up as a Video stream.
      const probe = spawnSync(ffmpegStatic!, ["-hide_banner", "-i", "pipe:0"], {
        input: mp3,
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024,
      });
      expect(probe.stderr.toString()).toMatch(/Video:/);
    } finally {
      await unlink(coverPath).catch(() => {});
      await unlink(mp3Path).catch(() => {});
    }
  });
});

describe("POST /api/admin/upload/process", () => {
  it("400s when the key is missing or not a .wav", async () => {
    const res1 = await processUpload(jsonRequest({}));
    expect(res1.status).toBe(400);
    const res2 = await processUpload(jsonRequest({ key: "audio/foo/track.mp3" }));
    expect(res2.status).toBe(400);
  });

  it("fetches the WAV, transcodes, and uploads the MP3 — returns its URL", async () => {
    const wav = generateSilentWav();
    vi.mocked(getFileBuffer).mockResolvedValue(wav);
    vi.mocked(uploadStream).mockImplementation(async (stream, pathname) => {
      await streamToBuffer(stream);
      return { url: `https://r2/${pathname}`, storageKey: `https://r2/${pathname}` };
    });

    const res = await processUpload(
      jsonRequest({
        key: "audio/album/1/track.wav",
        metadata: { title: "Track", artist: "Party Pupils", album: "Album", trackNumber: 1, trackTotal: 1, year: 2024 },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.mp3Url).toBe("https://r2/audio/album/1/track.mp3");

    // The factory pulls the WAV down once (via getFileBuffer), re-uploads
    // the tagged WAV in place (uploadBuffer), then streams the MP3 up.
    expect(vi.mocked(getFileBuffer)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadBuffer)).toHaveBeenCalled();
    expect(vi.mocked(uploadStream)).toHaveBeenCalledTimes(1);
  });

  it("500s when storage is unreachable and surfaces the error", async () => {
    vi.mocked(getFileBuffer).mockRejectedValue(new Error("R2 unreachable"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await processUpload(jsonRequest({ key: "audio/x/1/t.wav" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Transcoding failed");
    expect(data.mp3Error).toContain("R2 unreachable");

    errSpy.mockRestore();
  });
});
