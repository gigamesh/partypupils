/**
 * Tests for download token authorization.
 * Single-track downloads now 302 to a presigned R2 URL — the function never
 * touches the audio body. Zip downloads still build the archive server-side
 * so they continue mocking the upstream R2 fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as downloadTrack } from "@/app/download/[token]/route";
import { GET as downloadZip } from "@/app/download/[token]/zip/route";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { makeRelease, makeTrackWithFile, makeCompletedOrder } from "../factories";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getPresignedDownloadUrl).mockReset();
  vi.mocked(getPresignedDownloadUrl).mockResolvedValue(
    "https://r2/signed?response-content-disposition=stub",
  );
});

function tokenReq(token: string, qs: string): NextRequest {
  return new NextRequest(`http://test/download/${token}?${qs}`);
}

function ctx(token: string) {
  return { params: Promise.resolve({ token }) };
}

describe("GET /download/[token]", () => {
  it("404s on an unknown token", async () => {
    const res = await downloadTrack(
      tokenReq("does-not-exist", "trackId=1&format=mp3"),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("403s when the token's order does not include the requested track", async () => {
    const release = await makeRelease();
    const ownedTrack = await makeTrackWithFile(release.id);
    const otherTrack = await makeTrackWithFile(release.id, { trackNumber: 2 });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [ownedTrack.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadTrack(
      tokenReq(token, `trackId=${otherTrack.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(403);
  });

  it("400s when trackId query is missing", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadTrack(tokenReq(token, "format=mp3"), ctx(token));
    expect(res.status).toBe(400);
  });

  it("302s to a presigned R2 URL when the order owns the track", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Owned" });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/r2\/signed/);
    expect(vi.mocked(getPresignedDownloadUrl)).toHaveBeenCalledWith(
      t.files[0].storageKey,
      { filename: "Owned.mp3", contentType: "audio/mpeg" },
    );
    // Critical: the function must NOT have fetched the audio body.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the wav content-type when format=wav", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Wave" });
    // makeTrackWithFile only seeds an mp3; add a wav so format=wav resolves a row.
    await prisma.trackFile.create({
      data: {
        trackId: t.id,
        format: "wav",
        fileName: "Wave.wav",
        storageKey: "https://r2/wave.wav",
        fileSize: 100,
      },
    });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=wav`),
      ctx(token),
    );
    expect(vi.mocked(getPresignedDownloadUrl)).toHaveBeenCalledWith(
      "https://r2/wave.wav",
      { filename: "Wave.wav", contentType: "audio/wav" },
    );
  });

  it("authorizes a track when the order purchased its parent release", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(302);
  });
});

describe("GET /download/[token]/zip", () => {
  it("403s when requesting tracks the order doesn't own", async () => {
    const release = await makeRelease();
    const ownedTrack = await makeTrackWithFile(release.id);
    const otherTrack = await makeTrackWithFile(release.id, { trackNumber: 2 });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [ownedTrack.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(
      tokenReq(token, `trackIds=${ownedTrack.id},${otherTrack.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(403);
  });

  it("403s when requesting a release the order doesn't own", async () => {
    const release = await makeRelease();
    await makeTrackWithFile(release.id);
    const otherRelease = await makeRelease({ slug: "other" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(
      tokenReq(token, `releaseId=${otherRelease.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(403);
  });

  it("400s when both releaseId and trackIds are missing", async () => {
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(tokenReq(token, "format=mp3"), ctx(token));
    expect(res.status).toBe(400);
  });

  it("502s when any track is unavailable in R2 (pre-flight HEAD check)", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    // HEAD pre-flight returns 404 → route should refuse to start streaming.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const res = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/temporarily unavailable/i);
    // We use t in the assertion above (release ownership is implicit in the test setup).
    expect(t.id).toBeGreaterThan(0);
  });

  it("starts streaming once HEAD pre-flight succeeds", async () => {
    const release = await makeRelease();
    await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    fetchMock.mockResolvedValue(new Response("audio-bytes", { status: 200 }));

    const res = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
  });
});
