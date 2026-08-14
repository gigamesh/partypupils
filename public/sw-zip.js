/**
 * Service worker that streams zip downloads straight to the user's download
 * manager. Bytes never enter the page heap and never round-trip through
 * Vercel — the redirect in step 4 hands the browser a URL it fetches from R2
 * directly.
 *
 * Flow:
 *   1. Page fetches a JSON manifest from `/download/[token]/zip?...` and
 *      `postMessage`s it here as `{ type: "register-zip", id, manifest }`.
 *   2. We stash the manifest in an in-memory Map keyed by `id` and
 *      `postMessage` `{ type: "ack", id }` back. The page only navigates
 *      after the ack — closes an iOS Safari race where the navigation
 *      can fire before the message has been processed.
 *   3. Page sets `window.location.href = /sw-zip/{id}/{filename}`. The
 *      browser's navigation hits our `fetch` handler.
 *   4. We pull the manifest by id and fetch its entries one at a time,
 *      piping them through `client-zip`'s `downloadZip()` which returns a
 *      streaming Response. Content-Disposition triggers a native download.
 *   5. Per-file failure policy: any individual fetch error is caught and
 *      replaced with a tiny `_FAILED_<filename>.txt` placeholder so one
 *      bad file doesn't corrupt the whole archive — and reported back to
 *      the page (step 6) so it doesn't pass for a clean download.
 *   6. Each failure is broadcast to the page as
 *      `{ type: "zip-failure", id, fileName, detail }`.
 *
 * Manifest URLs are same-origin links back to `/download/[token]`, not
 * presigned R2 URLs. That route 302s to a freshly signed URL, so each
 * signature is minted at the moment we reach that file. They used to be
 * presigned up front, all sharing one 5-minute expiry measured from the
 * click: since we fetch sequentially, every entry past minute five of a
 * multi-gigabyte archive died, and because R2's signature failures carry no
 * CORS headers the fetch rejected opaquely rather than reporting a 403. The
 * result was a zip that opened fine with most of the music replaced by
 * `_FAILED_*.txt`. Keep the fetch on the same-origin URL — do not "optimise"
 * it by resolving the redirect at manifest time.
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

  const zipResponse = downloadZip(zipEntries(manifest.files, id));

  return new Response(zipResponse.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${manifest.zipName.replace(/"/g, "")}"`,
    },
  });
}

/**
 * Tell every open page that one entry of download `id` couldn't be fetched.
 *
 * The `_FAILED_*.txt` placeholder below keeps the archive intact but makes a
 * broken purchase look like a successful download — the customer gets a zip
 * that opens cleanly and only finds out if they go looking. This is the only
 * channel back to the UI: the failure happens after the page has handed the
 * manifest over and navigated, so nothing on the page would otherwise know.
 *
 * Broadcast rather than replying to one client: `handleZipRequest` runs off a
 * navigation, so there's no `event.source` to answer. Best-effort by design —
 * a failure to report must never take down a download that's still producing
 * bytes.
 */
async function reportFailure(id, fileName, detail) {
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "zip-failure", id, fileName, detail });
    }
  } catch (err) {
    console.warn("[sw-zip] could not report failure to page:", err);
  }
}

/**
 * Async generator yielding one `{ name, input }` per manifest entry. On a
 * fetch failure we rename the entry to `_FAILED_<filename>.txt`, replace
 * the body with an explanatory text, and report it to the page — preserves
 * the rest of the archive instead of corrupting an mp3 with a plain-text
 * error, without the failure passing silently.
 *
 * Fetches are sequential by design: a zip is a sequential format and
 * `client-zip` consumes one body fully before moving to the next, so
 * firing all GETs up front would just hold extra connections open.
 */
async function* zipEntries(files, id) {
  for (const f of files) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      yield { name: f.fileName, input: res };
    } catch (err) {
      console.warn(`[sw-zip] fetch failed for ${f.fileName}:`, err);
      const detail = err && err.message ? err.message : String(err);
      reportFailure(id, f.fileName, detail);
      const message =
        `Failed to download "${f.fileName}": ${detail}.\n` +
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
