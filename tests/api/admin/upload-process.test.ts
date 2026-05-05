/**
 * Tests for the streaming WAV → MP3 transcoding route.
 *
 * The end-to-end pipeline (R2 GET → ffmpeg → R2 PUT) is exercised against the
 * real ffmpeg-static binary by piping a tiny generated WAV (1s silence) through
 * `convertWavStreamToMp3` directly. The route handler is then tested with the
 * storage layer mocked — we just verify it wires GET→ffmpeg→PUT and surfaces
 * errors rather than swallowing them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { Readable } from "stream";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { POST as processUpload } from "@/app/api/admin/upload/process/route";
import { convertWavStreamToMp3 } from "@/lib/preview";
import { getFileStream, uploadStream } from "@/lib/storage";

beforeEach(() => {
  vi.mocked(getFileStream).mockReset();
  vi.mocked(uploadStream).mockReset();
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

describe("convertWavStreamToMp3", () => {
  it("transcodes a small WAV stream to a non-empty MP3 stream", async () => {
    const wav = generateSilentWav();
    const mp3 = await streamToBuffer(convertWavStreamToMp3(Readable.from(wav), "128k"));
    expect(mp3.length).toBeGreaterThan(0);
    // First three bytes of an MP3: either an ID3 tag or an MPEG sync (0xFF 0xFB/0xFA/0xF3/0xF2).
    const isId3 = mp3.toString("ascii", 0, 3) === "ID3";
    const isSync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
    expect(isId3 || isSync).toBe(true);
  });

});

describe("POST /api/admin/upload/process", () => {
  it("400s when the key is missing or not a .wav", async () => {
    const res1 = await processUpload(jsonRequest({}));
    expect(res1.status).toBe(400);
    const res2 = await processUpload(jsonRequest({ key: "audio/foo/track.mp3" }));
    expect(res2.status).toBe(400);
  });

  it("streams source → transcode → upload for both bitrates and returns both URLs", async () => {
    const wav = generateSilentWav();
    // Each upload consumes its own R2 GET so the route gets two streams.
    vi.mocked(getFileStream).mockImplementation(async () => Readable.from(wav));
    vi.mocked(uploadStream).mockImplementation(async (stream, pathname) => {
      // Drain the stream to mimic a real upload finishing.
      await streamToBuffer(stream);
      return { url: `https://r2/${pathname}`, storageKey: `https://r2/${pathname}` };
    });

    const res = await processUpload(
      jsonRequest({ key: "audio/album/1/track.wav" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.previewUrl).toBe("https://r2/audio/album/1/previews/track-preview.mp3");
    expect(data.mp3Url).toBe("https://r2/audio/album/1/track.mp3");

    expect(vi.mocked(getFileStream)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadStream)).toHaveBeenCalledTimes(2);
  });

  it("500s when both transcodes fail and surfaces error details", async () => {
    vi.mocked(getFileStream).mockRejectedValue(new Error("R2 unreachable"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await processUpload(jsonRequest({ key: "audio/x/1/t.wav" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Transcoding failed");
    expect(data.previewError).toContain("R2 unreachable");
    expect(data.mp3Error).toContain("R2 unreachable");

    errSpy.mockRestore();
  });
});
