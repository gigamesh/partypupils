import { createSwZipFallbackHandler } from "@gigamusic/checkout";

// HTML 503 reached only when the `/sw-zip.js` service worker fails to
// intercept the navigation. Without this, the browser would save Next's
// 404 HTML under a `.zip` filename — surfaced by macOS Archive Utility as
// the confusing "Error 79 - Inappropriate file type or format."
export const GET = createSwZipFallbackHandler();
