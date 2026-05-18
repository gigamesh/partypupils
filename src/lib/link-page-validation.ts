export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set(["new", "edit", "admin", "api"]);

export const INVALID_SLUG_MESSAGE =
  "Slug must be lowercase letters, numbers, and dashes";
export const RESERVED_SLUG_MESSAGE = "Slug is reserved";

/** True for Prisma's "unique constraint violated" code (P2002). */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}
