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
import { storageProvider } from "@/lib/storage";

const storage = storageProvider();
const getFileBuffer = vi.mocked(storage.getFileBuffer);
const uploadBuffer = vi.mocked(storage.uploadBuffer);
const uploadStream = vi.mocked(storage.uploadStream);

beforeEach(() => {
  getFileBuffer.mockReset();
  uploadBuffer.mockReset();
  uploadStream.mockReset();
  uploadBuffer.mockResolvedValue({
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

/** Generate a small solid-colour JPEG to stand in for embedded cover art. */
function generateJpeg(): Buffer {
  if (!ffmpegStatic) throw new Error("ffmpeg-static missing for this platform");
  const result = spawnSync(
    ffmpegStatic,
    ["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", "-f", "mjpeg", "pipe:1"],
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
    getFileBuffer.mockResolvedValue(wav);
    uploadStream.mockImplementation(async (stream, pathname) => {
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
    expect(getFileBuffer).toHaveBeenCalledTimes(1);
    expect(uploadBuffer).toHaveBeenCalled();
    expect(uploadStream).toHaveBeenCalledTimes(1);
  });

  it("500s when storage is unreachable and surfaces the error", async () => {
    getFileBuffer.mockRejectedValue(new Error("R2 unreachable"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await processUpload(jsonRequest({ key: "audio/x/1/t.wav" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Transcoding failed");
    expect(data.mp3Error).toContain("R2 unreachable");

    errSpy.mockRestore();
  });
});

/**
 * Cover art reaches this endpoint as a storage key (`coverImageUrl`), never as
 * inline base64. That's load-bearing: this is a JSON body behind the
 * platform's 4.5 MB request cap, and a master's embedded 3000x3000 JPEG
 * base64-encodes past it — the request then dies with a plain-text
 * "Request Entity Too Large" before the function ever runs. These tests pin
 * the storage-key path the release form depends on.
 */
describe("POST /api/admin/upload/process — cover art", () => {
  const ART_URL = "https://cdn.example/images/track-art/album/1/art.jpg";

  /** Route getFileBuffer by key: the WAV for audio, the JPEG for the art. */
  function mockStorageWith(wav: Buffer, art: Buffer | Error) {
    getFileBuffer.mockImplementation(async (key: string) => {
      if (key === ART_URL) {
        if (art instanceof Error) throw art;
        return Buffer.from(art);
      }
      return Buffer.from(wav);
    });
  }

  /** Run a transcode and hand back the MP3 bytes that were streamed to R2. */
  async function transcodeCapturingMp3(body: Record<string, unknown>) {
    let mp3: Buffer = Buffer.alloc(0);
    uploadStream.mockImplementation(async (stream, pathname) => {
      mp3 = await streamToBuffer(stream);
      return { url: `https://r2/${pathname}`, storageKey: `https://r2/${pathname}` };
    });
    const res = await processUpload(
      jsonRequest({ key: "audio/album/1/track.wav", ...body }),
    );
    return { res, mp3 };
  }

  it("pulls the art out of storage and embeds it in the MP3", async () => {
    mockStorageWith(generateSilentWav(), generateJpeg());

    const { res, mp3 } = await transcodeCapturingMp3({
      metadata: { title: "Love Will Find A Way", artist: "Party Pupils" },
      coverImageUrl: ART_URL,
    });
    expect(res.status).toBe(200);

    // Fetched by key rather than decoded from the request body.
    expect(getFileBuffer).toHaveBeenCalledWith(ART_URL);

    const { parseBuffer } = await import("music-metadata");
    const { common } = await parseBuffer(mp3, { mimeType: "audio/mpeg" });
    expect(common.picture?.[0]).toBeDefined();
    expect(common.title).toBe("Love Will Find A Way");
  });

  it("tags the MP3 without art when no art is supplied", async () => {
    mockStorageWith(generateSilentWav(), generateJpeg());

    const { res, mp3 } = await transcodeCapturingMp3({
      metadata: { title: "No Art", artist: "Party Pupils" },
    });
    expect(res.status).toBe(200);

    // Only the WAV is fetched — no speculative art lookup.
    expect(getFileBuffer).toHaveBeenCalledTimes(1);

    const { parseBuffer } = await import("music-metadata");
    const { common } = await parseBuffer(mp3, { mimeType: "audio/mpeg" });
    expect(common.picture ?? []).toHaveLength(0);
    expect(common.title).toBe("No Art");
  });

  it("still transcodes when the art can't be fetched", async () => {
    // Art is cosmetic — losing it must not cost the admin a full re-upload of
    // a multi-hundred-MB WAV.
    mockStorageWith(generateSilentWav(), new Error("art object missing"));

    const { res, mp3 } = await transcodeCapturingMp3({
      metadata: { title: "Art Missing", artist: "Party Pupils" },
      coverImageUrl: ART_URL,
    });

    expect(res.status).toBe(200);
    const { parseBuffer } = await import("music-metadata");
    const { common } = await parseBuffer(mp3, { mimeType: "audio/mpeg" });
    expect(common.title).toBe("Art Missing");
  });

  it("still honours an inline artDataUrl, the path the form no longer uses", async () => {
    mockStorageWith(generateSilentWav(), generateJpeg());
    const inlineArt = `data:image/jpeg;base64,${generateJpeg().toString("base64")}`;

    const { res, mp3 } = await transcodeCapturingMp3({
      metadata: { title: "Inline", artist: "Party Pupils" },
      artDataUrl: inlineArt,
    });

    expect(res.status).toBe(200);
    // Decoded from the body, so the WAV stays the only storage read.
    expect(getFileBuffer).toHaveBeenCalledTimes(1);
    const { parseBuffer } = await import("music-metadata");
    const { common } = await parseBuffer(mp3, { mimeType: "audio/mpeg" });
    expect(common.picture?.[0]).toBeDefined();
  });

  it("never writes an Album Artist tag", async () => {
    // TPE2 must stay empty: a populated Album Artist makes Apple Music split
    // an album into one entry per track.
    mockStorageWith(generateSilentWav(), generateJpeg());

    const { mp3 } = await transcodeCapturingMp3({
      metadata: {
        title: "Love Will Find A Way",
        artist: "Party Pupils",
        album: "Yacht House Summer Vol. 3",
        trackNumber: 1,
        trackTotal: 8,
      },
      coverImageUrl: ART_URL,
    });

    const { parseBuffer } = await import("music-metadata");
    const { common, native } = await parseBuffer(mp3, { mimeType: "audio/mpeg" });
    expect(common.albumartist).toBeUndefined();
    const frames = Object.values(native).flat();
    expect(frames.find((f) => f.id === "TPE2")).toBeUndefined();
  });
});
