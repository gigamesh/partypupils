/**
 * TEMPORARY — manual test page for PR #7 (SW + client-zip streaming).
 * Delete this file before merging.
 *
 * Lives on the `client-zip-streaming` branch so the Vercel preview
 * deployment exposes it at `/test-download`. The page server-renders
 * against whatever DB/R2 creds the preview env has (prod, typically),
 * looks up the most recent download token whose order owns release 18
 * ("Yacht House Summer - Vol 1 - WAVs", 20 tracks, ~200 MB MP3 /
 * ~1.5 GB WAV), and renders working zip + per-track buttons.
 *
 * What to check on the preview URL:
 *   1. DevTools → Application → Service Workers: `sw-zip.js` should
 *      register and activate within ~1s.
 *   2. Click a ZIP button. Network tab:
 *      - GET /download/{token}/zip?releaseId=18&format=… → 200 JSON
 *        manifest of presigned R2 URLs.
 *      - Navigation to /sw-zip/{uuid}/{filename}.zip
 *        (initiator: ServiceWorker).
 *      - 20 GETs to *.r2.cloudflarestorage.com, all with initiator
 *        ServiceWorker — bytes flow R2 → SW → browser download
 *        manager, never enter Vercel.
 *   3. Browser shows native download with the zip filename + progress.
 *
 * If every R2 request CORS-fails: the bucket CORS rule doesn't yet
 * cover the preview deployment's hostname. Add `https://*.vercel.app`
 * (or the specific preview origin) to AllowedOrigins.
 */
import { prisma } from "@/lib/db";
import { DownloadButtons } from "@/components/DownloadButtons";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";
import type { Metadata } from "next";

const RELEASE_ID = 18;

export const dynamic = "force-dynamic";

// Belt-and-suspenders: don't accidentally surface this temp page to search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TestDownloadPage() {
  const release = await prisma.release.findUnique({
    where: { id: RELEASE_ID },
    include: {
      tracks: {
        orderBy: { trackNumber: "asc" },
        include: {
          files: { select: { format: true, fileSize: true } },
        },
      },
    },
  });

  if (!release) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl mb-4">PR #7 download test</h1>
        <p className="text-red-500">Release id {RELEASE_ID} not found.</p>
      </div>
    );
  }

  const tokenRow = await prisma.downloadToken.findFirst({
    where: { order: { items: { some: { releaseId: RELEASE_ID } } } },
    orderBy: { createdAt: "desc" },
    select: { token: true, order: { select: { email: true } } },
  });

  // Aggregate format availability + size totals across the release.
  const formatStats = new Map<string, { count: number; bytes: number }>();
  for (const t of release.tracks) {
    for (const f of t.files) {
      const cur = formatStats.get(f.format) ?? { count: 0, bytes: 0 };
      cur.count += 1;
      cur.bytes += f.fileSize ?? 0;
      formatStats.set(f.format, cur);
    }
  }
  const availableFormats = Array.from(formatStats.keys());

  // Pick a single track for the per-track button row (track 191 = "Ambrosia").
  const featuredTrack = release.tracks.find((t) => t.id === 191) ?? release.tracks[0];
  const featuredFormats = featuredTrack?.files.map((f) => f.format) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl">PR #7 — SW + client-zip streaming test</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Temporary. Delete <code>src/app/test-download/</code> before merging.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Release:</span> {release.name}{" "}
          <span className="text-muted-foreground">(id={release.id})</span>
        </p>
        <p>
          <span className="text-muted-foreground">Tracks:</span>{" "}
          {release.tracks.length}
        </p>
        {Array.from(formatStats.entries()).map(([format, stat]) => (
          <p key={format}>
            <span className="text-muted-foreground">
              {format.toUpperCase()} files:
            </span>{" "}
            {stat.count} · ~{Math.round(stat.bytes / 1_000_000)} MB total
          </p>
        ))}
        {tokenRow ? (
          <p>
            <span className="text-muted-foreground">Using token from order:</span>{" "}
            {tokenRow.order.email}
          </p>
        ) : null}
      </div>

      {!tokenRow ? (
        <p className="text-red-500 text-sm">
          No download tokens found for any order containing release {RELEASE_ID}.
        </p>
      ) : availableFormats.length === 0 ? (
        <p className="text-red-500 text-sm">
          No TrackFile rows in this release — nothing to download.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <p className="text-sm font-medium">Whole-release ZIP (the new SW path):</p>
            <DownloadZipButtons
              token={tokenRow.token}
              releaseId={release.id}
              availableFormats={availableFormats}
            />
            <p className="text-xs text-muted-foreground">
              MP3 zip ≈ {Math.round((formatStats.get("mp3")?.bytes ?? 0) / 1_000_000)}{" "}
              MB · WAV zip ≈{" "}
              {Math.round((formatStats.get("wav")?.bytes ?? 0) / 1_000_000)} MB
              (the WAV button is the real stress test for streaming).
            </p>
          </div>

          {featuredTrack && featuredFormats.length > 0 ? (
            <div className="space-y-3 pt-4 border-t border-border">
              <p className="text-sm font-medium">
                Per-track download (already-shipped #5 redirect path) — for comparison:
              </p>
              <p className="text-xs text-muted-foreground">
                Track {featuredTrack.trackNumber}: {featuredTrack.name}
              </p>
              <DownloadButtons
                token={tokenRow.token}
                trackId={featuredTrack.id}
                availableFormats={featuredFormats}
              />
            </div>
          ) : null}
        </>
      )}

      <div className="text-xs text-muted-foreground space-y-2 pt-4 border-t border-border">
        <p>
          <strong>SW status:</strong> DevTools → Application → Service Workers
          should show <code>sw-zip.js</code> as activated.
        </p>
        <p>
          <strong>Zip flow:</strong> manifest 200 → navigation to{" "}
          <code>/sw-zip/&lt;uuid&gt;/...</code> (initiator: ServiceWorker) → 20 GETs to
          R2 (initiator: ServiceWorker) → native download with progress.
        </p>
        <p>
          <strong>If every R2 request fails:</strong> R2 bucket CORS isn&apos;t
          covering this preview deployment&apos;s origin. Add{" "}
          <code>https://*.vercel.app</code> (or the specific preview hostname)
          to AllowedOrigins. Without it the SW yields{" "}
          <code>_FAILED_*.txt</code> placeholders for every file.
        </p>
      </div>
    </div>
  );
}
