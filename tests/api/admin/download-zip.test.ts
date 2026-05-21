/**
 * Admin zip manifest endpoint. Reuses the customer single-release zip logic
 * (`buildReleaseZipBundle`) but is gated by the admin session instead of a
 * download token. Auth defaults to authed via the global mock in tests/setup.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as adminZip } from "@/app/api/admin/download/zip/route";
import { verifyAdminSession } from "@/lib/admin-auth";
import { makeRelease, makeTrackWithFile } from "../../factories";

function req(qs: string): NextRequest {
  return new NextRequest(`http://test/api/admin/download/zip?${qs}`);
}

describe("GET /api/admin/download/zip", () => {
  it("401s when the admin session is invalid", async () => {
    vi.mocked(verifyAdminSession).mockResolvedValueOnce(false);
    const res = await adminZip(req("releaseId=1&format=mp3"));
    expect(res.status).toBe(401);
  });

  it("400s when releaseId is missing", async () => {
    const res = await adminZip(req("format=mp3"));
    expect(res.status).toBe(400);
  });

  it("404s when the release does not exist", async () => {
    const res = await adminZip(req("releaseId=99999&format=mp3"));
    expect(res.status).toBe(404);
  });

  it("404s when the release has no audio files", async () => {
    const release = await makeRelease({ name: "Empty" });
    const res = await adminZip(req(`releaseId=${release.id}&format=mp3`));
    expect(res.status).toBe(404);
  });

  it("returns the manifest a customer would get — cover art in Extended/ included", async () => {
    const release = await makeRelease({
      name: "Yacht House",
      coverImageUrl: "https://r2.example/covers/yacht-house.png",
    });
    await makeTrackWithFile(release.id, { name: "Peg", trackNumber: 1, fileName: "Peg (Remix).mp3" });
    await makeTrackWithFile(release.id, { name: "Peg Ext", trackNumber: 2, fileName: "Peg (Remix) Extended.mp3" });

    const res = await adminZip(req(`releaseId=${release.id}&format=mp3`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.zipName).toBe("Yacht House (MP3).zip");
    expect(body.files.map((f: { fileName: string }) => f.fileName)).toEqual([
      "Peg (Remix).mp3",
      "Extended/Peg (Remix) Extended.mp3",
      "Yacht House - COVER ART.jpg",
      "Extended/Yacht House - COVER ART.jpg",
    ]);
  });
});
