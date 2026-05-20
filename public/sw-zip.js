/**
 * Service worker that streams zip downloads from R2 directly to the user's
 * download manager. Bytes never enter the page heap and never round-trip
 * through Vercel.
 *
 * Flow:
 *   1. Page fetches a JSON manifest of presigned R2 URLs from
 *      `/download/[token]/zip?...` and `postMessage`s it here as
 *      `{ type: "register-zip", id, manifest }`.
 *   2. We stash the manifest in an in-memory Map keyed by `id` and
 *      `postMessage` `{ type: "ack", id }` back. The page only navigates
 *      after the ack — closes an iOS Safari race where the navigation
 *      can fire before the message has been processed.
 *   3. Page sets `window.location.href = /sw-zip/{id}/{filename}`. The
 *      browser's navigation hits our `fetch` handler.
 *   4. We pull the manifest by id, fetch each URL in parallel from R2,
 *      and pipe them through `client-zip`'s `downloadZip()` which returns
 *      a streaming Response. Content-Disposition triggers a native download.
 *   5. Per-file failure policy: any individual fetch error is caught and
 *      replaced with a tiny `_FAILED_<filename>.txt` placeholder so one
 *      bad file doesn't corrupt the whole archive.
 */

importScripts("/client-zip-worker.js"); // exposes globalThis.downloadZip

/** @type {Map<string, { zipName: string, files: { url: string, fileName: string }[] }>} */
const manifests = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "register-zip" && typeof data.id === "string" && data.manifest) {
    manifests.set(data.id, data.manifest);
    // Ack so the page can safely navigate without racing this handler.
    if (event.source) {
      event.source.postMessage({ type: "ack", id: data.id });
    }
    return;
  }

  if (data.type === "keepalive") {
    // No-op — receiving the message itself extends the SW's lifetime
    // long enough to outlive a slow fetch on iOS Safari.
    return;
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/sw-zip\/([^/]+)\/(.+)$/);
  if (!match) return; // not ours; let the network handle it

  const id = match[1];
  event.respondWith(handleZipRequest(id));
});

async function handleZipRequest(id) {
  const manifest = manifests.get(id);
  if (!manifest) {
    return new Response(
      "Download expired or already completed. Please click the button again.",
      { status: 410, headers: { "Content-Type": "text/plain" } },
    );
  }
  // One-shot: a fresh manifest per click means we can drop this one once
  // streaming starts so the Map doesn't grow unbounded across sessions.
  manifests.delete(id);

  const zipResponse = downloadZip(zipEntries(manifest.files));

  return new Response(zipResponse.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${manifest.zipName.replace(/"/g, "")}"`,
    },
  });
}

/**
 * Async generator yielding one `{ name, input }` per manifest entry. On a
 * fetch failure we rename the entry to `_FAILED_<filename>.txt` and replace
 * the body with an explanatory text — preserves the rest of the archive
 * instead of corrupting an mp3 with a plain-text error.
 *
 * Fetches are sequential by design: a zip is a sequential format and
 * `client-zip` consumes one body fully before moving to the next, so
 * firing all GETs up front would just hold extra R2 connections open.
 */
async function* zipEntries(files) {
  for (const f of files) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      yield { name: f.fileName, input: res };
    } catch (err) {
      console.warn(`[sw-zip] fetch failed for ${f.fileName}:`, err);
      const detail = err && err.message ? err.message : String(err);
      const message =
        `Failed to download "${f.fileName}" from R2: ${detail}.\n` +
        `Try downloading the track individually from your order page.\n`;
      // Keep the placeholder at the zip root (drop any folder prefix) so a
      // failure is obvious instead of buried inside a release folder.
      const baseName = f.fileName.split("/").pop() || f.fileName;
      yield {
        name: `_FAILED_${baseName}.txt`,
        input: new Response(message, { headers: { "Content-Type": "text/plain" } }),
      };
    }
  }
}
