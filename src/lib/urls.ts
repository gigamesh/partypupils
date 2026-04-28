const INTERNAL_ORIGINS = [
  "https://partypupils.com",
  "https://www.partypupils.com",
];

/** Returns true for relative paths and URLs pointing to the Party Pupils site. */
export function isInternalUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  return INTERNAL_ORIGINS.some(
    (origin) => url === origin || url.startsWith(origin + "/")
  );
}

/**
 * Lightweight CSRF protection for public POST endpoints (checkout, contact).
 *
 * Checks the request's `Origin` header (preferred) or falls back to `Referer`.
 * Accepts the request only if it came from:
 *   - one of our known production domains, OR
 *   - the `NEXT_PUBLIC_BASE_URL` configured for this deployment, OR
 *   - localhost / 127.0.0.1 on any port (dev), OR
 *   - any subdomain of `vercel.app` (preview deployments).
 *
 * Doesn't stop a determined attacker driving a real browser, but blocks the
 * cheap vectors (curl, fetch from another origin, basic abuse scripts).
 */
export function isAllowedRequestOrigin(req: Request): boolean {
  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const candidate = originHeader || refererHeader;
  if (!candidate) return false;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  const candidateOrigin = parsed.origin;

  if (INTERNAL_ORIGINS.includes(candidateOrigin)) return true;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
      if (new URL(baseUrl).origin === candidateOrigin) return true;
    } catch {
      /* malformed env var — ignore */
    }
  }

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
  if (parsed.hostname.endsWith(".vercel.app")) return true;

  return false;
}
