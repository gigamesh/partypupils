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

  it("302s to a presigned R2 URL with the original uploaded filename when the order owns the track", async () => {
    const release = await makeRelease();
    // Leading space mirrors real prod data — it must be trimmed off.
    const t = await makeTrackWithFile(release.id, {
      name: "Owned",
      fileName: " owned_master_v3.mp3",
    });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadTrack(
      tokenReq(token, `trackId=${t.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/r2\/signed/);
    // Filename comes from the stored TrackFile.fileName (whitespace-trimmed),
    // not the track name.
    expect(vi.mocked(getPresignedDownloadUrl)).toHaveBeenCalledWith(
      t.files[0].storageKey,
      { filename: "owned_master_v3.mp3", contentType: "audio/mpeg" },
    );
    // Critical: the function must NOT have fetched the audio body.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the wav content-type and original wav filename when format=wav", async () => {
    const release = await makeRelease();
    const t = await makeTrackWithFile(release.id, { name: "Wave" });
    // makeTrackWithFile only seeds an mp3; add a wav so format=wav resolves a row.
    await prisma.trackFile.create({
      data: {
        trackId: t.id,
        format: "wav",
        fileName: "wave_master_24bit.wav",
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
      { filename: "wave_master_24bit.wav", contentType: "audio/wav" },
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

describe("GET /download/[token]/zip (manifest endpoint)", () => {
  it("404s on an unknown token", async () => {
    const res = await downloadZip(
      tokenReq("does-not-exist", "releaseId=1&format=mp3"),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

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

  it("returns a manifest of the whole order, nesting each release in its own folder", async () => {
    const release = await makeRelease({ name: "Whole Album" });
    await makeTrackWithFile(release.id, { name: "One", trackNumber: 1, fileName: "track-one_MASTER.mp3" });
    await makeTrackWithFile(release.id, { name: "Two", trackNumber: 2, fileName: "track-two_MASTER.mp3" });
    const aLaCarteRelease = await makeRelease({ slug: "ala", name: "Solo Source" });
    const aLaCarteTrack = await makeTrackWithFile(aLaCarteRelease.id, { name: "Solo", fileName: "solo_MASTER.mp3" });
    const order = await makeCompletedOrder({
      email: "x@y",
      releaseIds: [release.id],
      trackIds: [aLaCarteTrack.id],
    });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(tokenReq(token, "format=mp3"), ctx(token));
    expect(res.status).toBe(200);
    const body = await res.json();

    // `zipNamePrefix: SITE_NAME` ("Party Pupils") is wired into the route
    // factory, so the zip filename keeps its historical artist-name prefix.
    expect(body.zipName).toBe(`Party Pupils - Order ${order.id} (MP3).zip`);
    // Each track sits under a "Release Name/" folder and keeps its original
    // uploaded filename verbatim — no track-number prefix is added.
    expect(body.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Whole Album/track-one_MASTER.mp3",
      "Whole Album/track-two_MASTER.mp3",
      "Solo Source/solo_MASTER.mp3",
    ]);
  });

  it("keeps already-numbered filenames intact and trims stray whitespace", async () => {
    // Mirrors real prod data: some uploaded filenames already carry their own
    // track number, and some carry accidental leading/trailing spaces.
    const release = await makeRelease({ name: "Numbered Album" });
    await makeTrackWithFile(release.id, { name: "First", trackNumber: 1, fileName: "01 Summer Breeze (Remix).mp3" });
    await makeTrackWithFile(release.id, { name: "Second", trackNumber: 2, fileName: " Georgy Porgy (Remix) .mp3" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // No "01 - 01 ..." doubling; whitespace around the name is trimmed.
    expect(body.files[0].fileName).toBe("01 Summer Breeze (Remix).mp3");
    expect(body.files[1].fileName).toBe("Georgy Porgy (Remix).mp3");
  });

  it("nests extended-mix tracks in an Extended/ subfolder", async () => {
    const release = await makeRelease({ name: "Yacht House" });
    await makeTrackWithFile(release.id, { name: "Peg", trackNumber: 1, fileName: "Steely Dan - Peg (Remix).mp3" });
    await makeTrackWithFile(release.id, { name: "Peg Ext", trackNumber: 2, fileName: "Steely Dan - Peg (Remix) Extended.mp3" });
    // "[EXTENDED MIX]" is another marker variant seen in the catalog.
    await makeTrackWithFile(release.id, { name: "Africa Ext", trackNumber: 3, fileName: "Africa (Remix) [EXTENDED MIX].mp3" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    // Whole-order zip → release folder, with extended mixes in Extended/.
    const orderRes = await downloadZip(tokenReq(token, "format=mp3"), ctx(token));
    const orderBody = await orderRes.json();
    expect(orderBody.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Yacht House/Steely Dan - Peg (Remix).mp3",
      "Yacht House/Extended/Steely Dan - Peg (Remix) Extended.mp3",
      "Yacht House/Extended/Africa (Remix) [EXTENDED MIX].mp3",
    ]);

    // Single-release zip → flat, but extended mixes still get an Extended/ folder.
    const relRes = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    const relBody = await relRes.json();
    expect(relBody.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Steely Dan - Peg (Remix).mp3",
      "Extended/Steely Dan - Peg (Remix) Extended.mp3",
      "Extended/Africa (Remix) [EXTENDED MIX].mp3",
    ]);
  });

  it("places the release cover art in the Extended/ subfolder too", async () => {
    const release = await makeRelease({
      name: "Yacht House",
      coverImageUrl: "https://r2.example/covers/yacht-house.png",
    });
    await makeTrackWithFile(release.id, { name: "Peg", trackNumber: 1, fileName: "Peg (Remix).mp3" });
    await makeTrackWithFile(release.id, { name: "Peg Ext", trackNumber: 2, fileName: "Peg (Remix) Extended.mp3" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    // Single-release zip → flat cover, plus a copy inside Extended/.
    const relRes = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    const relBody = await relRes.json();
    expect(relBody.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Peg (Remix).mp3",
      "Extended/Peg (Remix) Extended.mp3",
      "Yacht House - COVER ART.jpg",
      "Extended/Yacht House - COVER ART.jpg",
    ]);

    // Whole-order zip → cover nested under the release folder and its Extended/.
    const orderRes = await downloadZip(tokenReq(token, "format=mp3"), ctx(token));
    const orderBody = await orderRes.json();
    expect(orderBody.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Yacht House/Peg (Remix).mp3",
      "Yacht House/Extended/Peg (Remix) Extended.mp3",
      "Yacht House/Yacht House - COVER ART.jpg",
      "Yacht House/Extended/Yacht House - COVER ART.jpg",
    ]);
  });

  it("omits the Extended/ cover copy when the release has no extended mixes", async () => {
    const release = await makeRelease({
      name: "Album One",
      coverImageUrl: "https://r2.example/covers/album-one.png",
    });
    await makeTrackWithFile(release.id, { name: "Track A", trackNumber: 1, fileName: "trackA.mp3" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    const body = await res.json();
    expect(body.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "trackA.mp3",
      "Album One - COVER ART.jpg",
    ]);
  });

  it("returns a flat manifest (no folder) for a single-release zip", async () => {
    const release = await makeRelease({ name: "Album One" });
    await makeTrackWithFile(release.id, { name: "Track A", trackNumber: 1, fileName: "trackA_final.mp3" });
    await makeTrackWithFile(release.id, { name: "Track B", trackNumber: 2, fileName: "trackB_final.mp3" });
    const order = await makeCompletedOrder({ email: "x@y", releaseIds: [release.id] });
    const token = order.downloadTokens[0].token;

    const res = await downloadZip(
      tokenReq(token, `releaseId=${release.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();

    expect(body.zipName).toBe("Party Pupils - Album One (MP3).zip");
    expect(body.files).toHaveLength(2);
    // Single-release zip stays flat — the zip itself is named after the release.
    expect(body.files[0].fileName).toBe("trackA_final.mp3");
    expect(body.files[1].fileName).toBe("trackB_final.mp3");
    body.files.forEach((f: { url: string }) => {
      expect(f.url).toMatch(/^https:\/\/r2\/signed/);
    });
    // Critical: the function must NOT have fetched any audio bytes itself.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a manifest for a list of owned trackIds (preserving order, nested by release)", async () => {
    const release = await makeRelease({ name: "Mix Album" });
    const t1 = await makeTrackWithFile(release.id, { name: "Alpha", trackNumber: 1, fileName: "alpha_v2.mp3" });
    const t2 = await makeTrackWithFile(release.id, { name: "Beta", trackNumber: 2, fileName: "beta_v2.mp3" });
    const order = await makeCompletedOrder({ email: "x@y", trackIds: [t1.id, t2.id] });
    const token = order.downloadTokens[0].token;

    // Request in reverse order — the manifest must preserve request order
    // (that's what the customer chose at checkout).
    const res = await downloadZip(
      tokenReq(token, `trackIds=${t2.id},${t1.id}&format=mp3`),
      ctx(token),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.zipName).toBe("Party Pupils - Tracks (MP3).zip");
    expect(body.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Mix Album/beta_v2.mp3",
      "Mix Album/alpha_v2.mp3",
    ]);
  });
});
