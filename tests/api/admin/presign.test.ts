/**
 * Presign route — covers key-shape validation and contentType allowlist.
 * The actual S3 signing call is mocked in setup.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST as presign } from "@/app/api/admin/upload/presign/route";
import { getPresignedUploadUrl } from "@/lib/storage";

beforeEach(() => {
  vi.mocked(getPresignedUploadUrl).mockClear();
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
    expect(vi.mocked(getPresignedUploadUrl)).not.toHaveBeenCalled();
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
    expect(vi.mocked(getPresignedUploadUrl)).toHaveBeenCalledWith(
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
