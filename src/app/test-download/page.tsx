/**
 * TEMPORARY — manual test page for PR #5 (single-track download bypass).
 * Delete this file before merging the PR.
 *
 * Hard-coded to track 191 ("Ambrosia — How Much I Feel (Party Pupils Remix)").
 * Looks up the most recent download token whose order includes this track
 * (directly or via its parent release) so the page renders a working
 * download button without requiring a token query string.
 *
 * Run with `npm run dev:prod` so DATABASE_URL + R2 credentials point at the
 * real bucket — otherwise the presigned URL won't resolve.
 *
 * Open DevTools → Network. Click MP3 / WAV. Expect:
 *   1. GET /download/{token}?trackId=191&format=… → 302
 *   2. Follow Location → GET <r2 url> → 200 with `Content-Disposition: attachment`
 *   3. File saves in-tab; play it to confirm.
 */
import { prisma } from "@/lib/db";
import { DownloadButtons } from "@/components/DownloadButtons";

const TRACK_ID = 191;

export const dynamic = "force-dynamic";

export default async function TestDownloadPage() {
  const track = await prisma.track.findUnique({
    where: { id: TRACK_ID },
    include: {
      files: { select: { format: true, fileName: true, fileSize: true } },
      release: { select: { id: true, name: true } },
    },
  });

  if (!track) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl mb-4">PR #5 download test</h1>
        <p className="text-red-500">Track id {TRACK_ID} not found.</p>
      </div>
    );
  }

  const tokenRow = await prisma.downloadToken.findFirst({
    where: {
      order: {
        items: {
          some: {
            OR: [{ trackId: TRACK_ID }, { releaseId: track.releaseId }],
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { token: true, order: { select: { email: true } } },
  });

  const availableFormats = track.files.map((f) => f.format);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl">PR #5 — single-track download test</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Temporary. Delete <code>src/app/test-download/</code> before merging.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Release:</span> {track.release.name}
        </p>
        <p>
          <span className="text-muted-foreground">Track:</span> {track.name}{" "}
          <span className="text-muted-foreground">(id={track.id})</span>
        </p>
        <p>
          <span className="text-muted-foreground">Files:</span>{" "}
          {track.files.length === 0
            ? "none uploaded"
            : track.files
                .map(
                  (f) =>
                    `${f.format.toUpperCase()} (${(f.fileSize ?? 0) / 1_000_000 | 0} MB)`,
                )
                .join(", ")}
        </p>
        {tokenRow ? (
          <p>
            <span className="text-muted-foreground">Using token from order:</span>{" "}
            {tokenRow.order.email}
          </p>
        ) : null}
      </div>

      {!tokenRow ? (
        <p className="text-red-500 text-sm">
          No download tokens found for any order containing this track or its
          release. Make a test purchase first.
        </p>
      ) : availableFormats.length === 0 ? (
        <p className="text-red-500 text-sm">
          No TrackFile rows for track {TRACK_ID} — nothing to download.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Click to download:</p>
          <DownloadButtons
            token={tokenRow.token}
            trackId={track.id}
            availableFormats={availableFormats}
          />
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t border-border">
        <p>
          <strong>Expected in Network tab:</strong> 302 from{" "}
          <code>/download/{"{token}"}?trackId={TRACK_ID}&amp;format=…</code> →{" "}
          followed redirect to a presigned R2 URL → 200 with{" "}
          <code>Content-Disposition: attachment</code>.
        </p>
      </div>
    </div>
  );
}
