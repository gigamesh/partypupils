/**
 * Presign route — covers key-shape validation and contentType allowlist.
 * The actual S3 signing call is mocked in setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST as presign } from "@/app/api/admin/upload/presign/route";
import { storageProvider } from "@/lib/storage";

const getPresignedUploadUrl = vi.mocked(storageProvider().getPresignedUploadUrl);

beforeEach(() => {
  getPresignedUploadUrl.mockClear();
});

function jsonReq(body: unknown): NextRequest {
  return new Request("http://test/api/admin/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/admin/upload/presign", () => {
  it("400s when key or contentType are missing", async () => {
    expect((await presign(jsonReq({}))).status).toBe(400);
    expect((await presign(jsonReq({ key: "audio/x/1/t.wav" }))).status).toBe(400);
    expect((await presign(jsonReq({ contentType: "audio/wav" }))).status).toBe(400);
  });

  it("400s when key has path traversal", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/../../../etc/passwd.wav", contentType: "audio/wav" }),
    );
    expect(res.status).toBe(400);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("400s when key uses an unknown top-level prefix", async () => {
    const res = await presign(
      jsonReq({ key: "secrets/leak.wav", contentType: "audio/wav" }),
    );
    expect(res.status).toBe(400);
  });

  it("400s when extension is not in the allowlist", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/track.exe", contentType: "audio/wav" }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on a contentType that isn't allowed", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/track.wav", contentType: "application/x-evil" }),
    );
    expect(res.status).toBe(400);
  });

  it("200s and returns the signed URL on a valid wav upload", async () => {
    const res = await presign(
      jsonReq({ key: "audio/album-slug/1/Track.wav", contentType: "audio/wav" }),
    );
    expect(res.status).toBe(200);
    // `@gigamusic/admin`'s presign factory uses the `StorageProvider`
    // method signature: `(key, { contentType, expiresInSeconds? })`.
    expect(getPresignedUploadUrl).toHaveBeenCalledWith(
      "audio/album-slug/1/Track.wav",
      expect.objectContaining({ contentType: "audio/wav" }),
    );
  });

  it("accepts application/octet-stream as the WAV fallback contentType", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/t.wav", contentType: "application/octet-stream" }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts an image upload under images/", async () => {
    const res = await presign(
      jsonReq({ key: "images/cover.jpg", contentType: "image/jpeg" }),
    );
    expect(res.status).toBe(200);
  });
});

/**
 * The size ceilings exist because every server-side path that touches a whole
 * audio file does it through the 500 MB of `/tmp` a function gets. Refusing at
 * presign is the only chance to fail fast — the bytes go straight to R2 after
 * this, so nothing downstream sees the file until it's already uploaded.
 */
describe("presign audio size ceilings", () => {
  const MB = 1024 * 1024;

  it("413s a WAV over the transcode ceiling", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/t.wav", contentType: "audio/wav", size: 300 * MB }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/over the 200 MB limit/);
    expect(getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("413s an MP3 over the retag ceiling", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/mix.mp3", contentType: "audio/mpeg", size: 300 * MB }),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/over the 240 MB limit/);
  });

  it("allows an MP3 that a WAV of the same size would fail", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/mix.mp3", contentType: "audio/mpeg", size: 220 * MB }),
    );
    expect(res.status).toBe(200);
  });

  it("ignores size on non-audio keys", async () => {
    const res = await presign(
      jsonReq({ key: "images/cover.jpg", contentType: "image/jpeg", size: 900 * MB }),
    );
    expect(res.status).toBe(200);
  });

  it("passes through when no size is reported", async () => {
    const res = await presign(
      jsonReq({ key: "audio/x/1/t.wav", contentType: "audio/wav" }),
    );
    expect(res.status).toBe(200);
  });
});

/**
 * Real filenames come off a mastering engineer's drive untouched — the form
 * uses `file.name` verbatim — so the key allowlist has to survive spaces,
 * parens, apostrophes and ampersands. A rejection here reads as a generic
 * "upload failed" to the admin, with nothing pointing at the filename.
 */
describe("presign key shapes seen in production", () => {
  const cases: Array<[string, string]> = [
    [
      "spaces, digits and parens",
      "audio/yacht-house-summer-vol-3/1/01 Love Will Find A Way (Party Pupils Remix).wav",
    ],
    ["an apostrophe", "audio/album/2/Don't Stop (Extended Mix).wav"],
    ["an ampersand and a comma", "audio/album/3/Smith & Jones, Pt. 2.wav"],
    ["a plus and brackets", "audio/album/4/Track [Bonus] + Reprise.wav"],
  ];

  for (const [label, key] of cases) {
    it(`accepts a track filename with ${label}`, async () => {
      const res = await presign(jsonReq({ key, contentType: "audio/wav" }));
      expect(res.status).toBe(200);
      expect(getPresignedUploadUrl).toHaveBeenCalledWith(
        key,
        expect.objectContaining({ contentType: "audio/wav" }),
      );
    });
  }

  it("accepts the per-track art key the release form uploads", async () => {
    // Embedded WAV art is stored as a file rather than sent inline as base64,
    // which is what keeps the transcode request under the 4.5 MB body cap.
    const res = await presign(
      jsonReq({
        key: "images/track-art/yacht-house-summer-vol-3/1/art.jpg",
        contentType: "image/jpeg",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("still rejects a traversal attempt dressed up as a real filename", async () => {
    const res = await presign(
      jsonReq({
        key: "audio/album/1/../../../etc/passwd (Remix).wav",
        contentType: "audio/wav",
      }),
    );
    expect(res.status).toBe(400);
  });
});
