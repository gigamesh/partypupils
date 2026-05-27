import { NextRequest, NextResponse } from "next/server";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import archiver from "archiver";
import { resolveCustomerZip } from "@/lib/release-zip";
import { getPresignedDownloadUrl } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Server-side bulk-download fallback. Mirrors `/download/[token]/zip`'s
 * file-list logic via `resolveCustomerZip()`, but streams a real zip back
 * to the browser through `archiver` instead of returning a manifest for
 * the client to assemble.
 *
 * Slower than the SW path (audio bytes proxy through Vercel and cost
 * egress), but works everywhere. Used when the customer's browser can't
 * run the service worker reliably — Safari, private/incognito mode,
 * older browsers.
 *
 * Per-file failure policy matches the SW: any failed R2 fetch becomes a
 * `_FAILED_<name>.txt` placeholder so one bad object doesn't taint the
 * whole archive.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const releaseId = parseInt(req.nextUrl.searchParams.get("releaseId") || "0");
  const trackIdsParam = req.nextUrl.searchParams.get("trackIds");
  const format = req.nextUrl.searchParams.get("format") || "mp3";

  const result = await resolveCustomerZip({ token, releaseId, trackIdsParam, format });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // `store: true` = no DEFLATE compression. MP3/WAV barely compress, and the
  // SW path already serves uncompressed entries — staying consistent means
  // identical byte counts.
  const archive = archiver("zip", { store: true });

  archive.on("error", (err) => {
    console.error("[zip-stream] archiver error:", err);
  });

  // Abort the pipeline if the client disconnects mid-download.
  req.signal.addEventListener("abort", () => archive.abort());

  // Pump R2 fetches into the archive. Each fetch starts as soon as the
  // previous one's response headers arrive — bodies stream concurrently
  // and archiver consumes them in append order. Good throughput without
  // holding the entire archive in memory.
  (async () => {
    for (const file of result.files) {
      if (req.signal.aborted) return;
      try {
        const url = await getPresignedDownloadUrl(file.storageKey, {
          filename: file.fileName.split("/").pop() ?? file.fileName,
          contentType: file.contentType,
        });
        const res = await fetch(url, { signal: req.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        // DOM `ReadableStream` and Node's web `ReadableStream` are
        // runtime-compatible but typed separately — cast at the boundary.
        const body = Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>);
        // Pass-through counter so we know how far the upstream R2 stream
        // got before failing. Useful for distinguishing "R2 never started"
        // from "R2 dropped us halfway through a large file."
        let bytesReceived = 0;
        const counter = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            bytesReceived += chunk.length;
            cb(null, chunk);
          },
        });
        const baseName = file.fileName.split("/").pop() || file.fileName;
        body.on("error", (err) => {
          // Tear the counter down so archiver stops waiting on it.
          counter.destroy(err);
          if (req.signal.aborted) return;
          // Client is still connected, so this is an upstream failure
          // (R2 dropped the socket, network blip, etc.). Log full context
          // and try to leave a _FAILED_ marker in the zip — archiver may
          // refuse further appends if the entry is partially written, but
          // best-effort is better than nothing.
          const detail = err instanceof Error ? err.message : String(err);
          console.error(
            `[zip-stream] body stream error for ${file.fileName} ` +
              `(storageKey=${file.storageKey}, bytesReceived=${bytesReceived}): ${detail}`,
          );
          try {
            archive.append(
              `Streaming "${file.fileName}" from R2 failed after ${bytesReceived} bytes: ${detail}.\n` +
                `Try downloading the track individually from your order page.\n`,
              { name: `_FAILED_${baseName}.txt` },
            );
          } catch (appendErr) {
            console.warn(
              `[zip-stream] could not append failure placeholder for ${file.fileName}:`,
              appendErr,
            );
          }
        });
        body.pipe(counter);
        archive.append(counter, { name: file.fileName });
      } catch (err) {
        if (req.signal.aborted) return;
        const detail = err instanceof Error ? err.message : String(err);
        const baseName = file.fileName.split("/").pop() || file.fileName;
        console.warn(`[zip-stream] fetch failed for ${file.fileName}:`, detail);
        archive.append(
          `Failed to download "${file.fileName}" from R2: ${detail}.\n` +
            `Try downloading the track individually from your order page.\n`,
          { name: `_FAILED_${baseName}.txt` },
        );
      }
    }
    await archive.finalize();
  })().catch((err) => {
    console.error("[zip-stream] pipeline error:", err);
    archive.abort();
  });

  return new Response(Readable.toWeb(archive) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.zipName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
