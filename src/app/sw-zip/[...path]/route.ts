import { NextResponse } from "next/server";

const ERROR_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Bulk download couldn't start</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.55; }
    h1 { font-size: 1.35rem; margin-bottom: 0.75rem; }
    ul { padding-left: 1.25rem; }
    li { margin: 0.35rem 0; }
    a { color: #6366f1; }
  </style>
</head>
<body>
  <h1>Bulk download couldn't start</h1>
  <p>Your browser couldn't generate the zip in the background. This usually happens in private/incognito mode, or after the order page has been open for a long time.</p>
  <p>To get your music:</p>
  <ul>
    <li>Go back to your order page and use the individual track download buttons.</li>
    <li>Or reopen the order link in a fresh tab and try the bulk download again.</li>
  </ul>
  <p><a href="javascript:history.back()">&larr; Back to your order</a></p>
</body>
</html>`;

/**
 * Fallback for `/sw-zip/{id}/{name}.zip` reached only when the
 * `/sw-zip.js` service worker fails to intercept the navigation. Without
 * this route the browser would save Next.js's 404 HTML under the URL's
 * `.zip` filename — and macOS Archive Utility surfaces that as the
 * confusing "Error 79 - Inappropriate file type or format". Returning
 * text/html (and no Content-Disposition) makes the browser render the
 * message instead of saving it.
 */
export function GET() {
  // Hitting this route is always a failure mode — the SW should have
  // intercepted. Log so we can track frequency in Vercel function logs.
  console.warn("[sw-zip] fallback route hit — service worker did not intercept");
  return new NextResponse(ERROR_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
