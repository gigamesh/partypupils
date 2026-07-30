/**
 * `presignAndUpload` is the first admin call of every release save, so it's
 * where an expired session surfaces first — as the 401 from the `src/proxy.ts`
 * gate that reached the client as a raw
 * `Failed to get upload URL (401) ... {"error":"Unauthorized"}`.
 *
 * The file itself never passes through a function: it goes straight to R2 on
 * the presigned URL, which is what keeps a 200 MB WAV clear of the platform's
 * 4.5 MB request-body cap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { presignAndUpload } from "@/lib/upload-client";
import { SessionExpiredError, throwIfSessionExpired } from "@/lib/session-expired";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const WAV_KEY = "audio/yacht-house-summer-vol-3/1/01 Love Will Find A Way (Party Pupils Remix).wav";

function wavFile(type = "audio/wav"): File {
  return new File([new Uint8Array([1, 2, 3])], "track.wav", { type });
}

/** Queue the presign response, then the R2 PUT response. */
function mockPresignThenPut(presign: Response, put = new Response("", { status: 200 })) {
  fetchMock.mockResolvedValueOnce(presign).mockResolvedValueOnce(put);
}

function presignOk() {
  return new Response(
    JSON.stringify({ url: "https://r2.example/signed?sig=abc", publicUrl: "https://cdn.example/track.wav" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("presignAndUpload", () => {
  it("presigns, PUTs the file to the signed URL, and returns the public URL", async () => {
    mockPresignThenPut(presignOk());

    const url = await presignAndUpload(wavFile(), WAV_KEY);
    expect(url).toBe("https://cdn.example/track.wav");

    const [presignUrl, presignInit] = fetchMock.mock.calls[0];
    expect(presignUrl).toBe("/api/admin/upload/presign");
    expect(JSON.parse(presignInit.body)).toEqual({
      key: WAV_KEY,
      contentType: "audio/wav",
    });

    // The bytes go to R2 directly — never to a function, so the request-size
    // cap that broke the transcode call can't apply to the audio itself.
    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe("https://r2.example/signed?sig=abc");
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers["Content-Type"]).toBe("audio/wav");
  });

  it("throws SessionExpiredError on a 401 from the auth gate", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(presignAndUpload(wavFile(), WAV_KEY)).rejects.toThrow(SessionExpiredError);
    // Nothing was uploaded — the save stops at the gate.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the session-expired message, not a raw 401 dump", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(presignAndUpload(wavFile(), WAV_KEY)).rejects.toThrow(
      /session expired.*new tab/i,
    );
  });

  it("keeps the diagnostic detail for non-401 presign failures", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unsupported contentType: audio/flac" }), {
        status: 400,
      }),
    );

    await expect(presignAndUpload(wavFile("audio/flac"), WAV_KEY)).rejects.toThrow(
      /Failed to get upload URL \(400\)[\s\S]*audio\/flac/,
    );
  });

  it("falls back to application/octet-stream when the OS reports no file type", async () => {
    mockPresignThenPut(presignOk());

    await presignAndUpload(wavFile(""), WAV_KEY);

    const [, presignInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(presignInit.body).contentType).toBe("application/octet-stream");
  });

  it("throws when the R2 PUT itself fails", async () => {
    mockPresignThenPut(presignOk(), new Response("", { status: 403 }));

    await expect(presignAndUpload(wavFile(), WAV_KEY)).rejects.toThrow("Failed to upload file");
  });
});

/**
 * Guards the other two admin calls a save makes (transcode, then the release
 * PUT/POST). Both run long after the presign, so a session can lapse between
 * them on a multi-track upload.
 */
describe("throwIfSessionExpired", () => {
  it("throws on the auth gate's 401", () => {
    expect(() => throwIfSessionExpired(new Response("", { status: 401 }))).toThrow(
      SessionExpiredError,
    );
  });

  it("stays out of the way of every other status", () => {
    for (const status of [200, 400, 403, 413, 500, 504]) {
      expect(() =>
        throwIfSessionExpired(new Response("", { status })),
      ).not.toThrow();
    }
  });
});
