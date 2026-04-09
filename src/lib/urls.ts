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
