"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DownloadZipButtonsProps {
  /** Manifest endpoint; the chosen `format` is appended as a query param. */
  manifestEndpoint: string;
  availableFormats: string[];
  className?: string;
}

interface Manifest {
  zipName: string;
  files: { url: string; fileName: string }[];
}

type SwState = "registering" | "ready" | "unavailable";

/**
 * Resolve a usable service worker at click time. `controller` is the source
 * of truth — it's non-null if a SW is actively controlling this page and
 * will intercept its navigations. `registration.active` is a best-effort
 * fallback for the first-activation race where `clients.claim()` hasn't
 * propagated yet.
 */
async function getActiveServiceWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active ?? null;
  } catch {
    return null;
  }
}

/**
 * Bulk download via Service Worker + `client-zip`. The button fetches a
 * manifest of presigned R2 URLs, hands it to the SW, then navigates the
 * browser to a SW-intercepted URL that streams the zip directly from R2 —
 * audio bytes never touch Vercel and never enter this page's heap.
 *
 * Browsers without `navigator.serviceWorker` (or where registration fails)
 * see a fallback message; per-track downloads still work via PR 1's bypass.
 *
 * Click-time recheck: cached `swState` lies when the SW was evicted or
 * unregistered after mount (long-lived tabs, private browsing, browser
 * cleanup). We re-resolve the worker on every click and flip to the
 * unavailable fallback if it's gone — otherwise the navigation would hit
 * the `/sw-zip/[...path]` route and the customer would save a styled HTML
 * error page under a `.zip` filename.
 */
export function DownloadZipButtons({
  manifestEndpoint,
  availableFormats,
  className,
}: DownloadZipButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [swState, setSwState] = useState<SwState>("registering");
  const swRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      setSwState("unavailable");
      return;
    }

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw-zip.js")
      .then(async () => {
        const reg = await navigator.serviceWorker.ready;
        if (cancelled) return;
        // `controller` is null for the very first SW activation in this tab;
        // ready+`active` covers that case.
        swRef.current = navigator.serviceWorker.controller ?? reg.active;
        setSwState(swRef.current ? "ready" : "unavailable");
      })
      .catch((err) => {
        console.warn("[sw-zip] registration failed:", err);
        if (!cancelled) setSwState("unavailable");
      });

    const onControllerChange = () => {
      swRef.current = navigator.serviceWorker.controller;
      if (swRef.current) setSwState("ready");
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  async function handleClick(format: string) {
    if (loading) return;
    setLoading(format);

    // Re-resolve the SW now — the cached ref can be stale (see component doc).
    // If it's gone, surface the same fallback message as a never-registered
    // browser instead of letting the navigation download an HTML error page.
    const sw = await getActiveServiceWorker();
    if (!sw) {
      setSwState("unavailable");
      setLoading(null);
      return;
    }
    swRef.current = sw;

    try {
      const manifestUrl = new URL(manifestEndpoint, window.location.origin);
      manifestUrl.searchParams.set("format", format);
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
      const manifest = (await res.json()) as Manifest;

      const id = crypto.randomUUID();
      // Wait for the SW to ack before navigating — closes the iOS Safari
      // race where the navigation reaches the fetch handler before the
      // message has been processed.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("SW ack timeout")),
          5000,
        );
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === "ack" && event.data.id === id) {
            clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener("message", onMessage);
            resolve();
          }
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        sw.postMessage({ type: "register-zip", id, manifest });
      });

      // Keep the SW alive across slow first-byte on iOS Safari. Cleared on
      // pagehide or after 60s — the download has either started streaming
      // or failed by then.
      const keepalive = window.setInterval(() => {
        sw.postMessage({ type: "keepalive" });
      }, 10_000);
      const stopKeepalive = () => window.clearInterval(keepalive);
      window.addEventListener("pagehide", stopKeepalive, { once: true });
      window.setTimeout(stopKeepalive, 60_000);

      window.location.href = `/sw-zip/${id}/${encodeURIComponent(manifest.zipName)}`;
    } catch (err) {
      console.error("[zip-download] failed:", err);
      setLoading(null);
      return;
    }

    // Best-effort: clear the spinner after a few seconds in case the user
    // stays on the page (the navigation doesn't unload — it's a SW intercept).
    window.setTimeout(() => setLoading(null), 3000);
  }

  if (swState === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground">
        Bulk download requires a modern browser. Use the per-track download
        buttons above.
      </p>
    );
  }

  return (
    <div className={cn("flex gap-2", className)}>
      {availableFormats.map((format) => (
        <Button
          key={format}
          type="button"
          size="sm"
          onClick={() => handleClick(format)}
          disabled={loading !== null || swState !== "ready"}
        >
          {loading === format ? (
            <>
              <Loader2Icon className="h-4 w-4 animate-spin" /> Zipping
            </>
          ) : (
            `${format.toUpperCase()} ZIP`
          )}
        </Button>
      ))}
    </div>
  );
}
