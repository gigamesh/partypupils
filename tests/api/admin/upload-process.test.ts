/**
 * Route-level tests for the WAV → MP3 transcoding endpoint.
 *
 * Production transcoding is owned by `@gigamusic/audio` and is covered by
 * that package's own test suite (transcode + tag-mp3 + tag-wav + the
 * TPE2-strip type test). These tests only assert that the route wires the
 * storage layer correctly: GET → ffmpeg → PUT, plus the error surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { Readable } from "stream";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { POST as processUpload } from "@/app/api/admin/upload/process/route";
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
