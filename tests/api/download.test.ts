/**
 * Tests for download token authorization.
 * Mocks the upstream R2 fetch so we can assert on response headers/status without
 * hitting the network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as downloadTrack } from "@/app/download/[token]/route";
import { GET as downloadZip } from "@/app/download/[token]/zip/route";
import { makeRelease, makeTrackWithFile, makeCompletedOrder } from "../factories";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
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

  it("streams the file with attachment headers when the order owns the track", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Owned" });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    fetchMock.mockResolvedValueOnce(new Response("audio-bytes", { status: 200 }));

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="Owned.mp3"');
  });

  it("authorizes a track when the order purchased its parent release", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    fetchMock.mockResolvedValueOnce(new Response("bytes", { status: 200 }));

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
  });

  it("502s when the upstream R2 fetch fails", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id);
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 503 }));

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(502);
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
});
