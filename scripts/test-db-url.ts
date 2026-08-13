/**
 * Shared derivation of the test database URL, imported by both the runner
 * (`scripts/run-tests.ts`) and the guard in `tests/setup.ts` so the two can
 * never disagree about which database tests are allowed to destroy.
 */

export const TEST_DATABASE_SUFFIX = "_test";

/**
 * Swap the database name in a libpq-style URL. Defaults to appending
 * `_test`, so `postgresql://…/party_pupils?x=1` becomes
 * `postgresql://…/party_pupils_test?x=1`. Query string, credentials, host and
 * port are preserved. A name that already ends in `_test` is left as-is, so the
 * derivation is idempotent.
 */
export function testDatabaseUrl(
  url: string,
  overrideName?: string,
): { url: string; database: string } {
  // Parse as http so `URL` splits credentials/host/path/query for us; the
  // postgres scheme is restored on the way out.
  const scheme = url.startsWith("postgresql://") ? "postgresql://" : "postgres://";
  const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
  const current = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const database =
    overrideName ??
    (current.endsWith(TEST_DATABASE_SUFFIX) ? current : `${current}${TEST_DATABASE_SUFFIX}`);

  parsed.pathname = `/${encodeURIComponent(database)}`;
  return { url: parsed.toString().replace(/^http:\/\//, scheme), database };
}

/** The database name a URL points at, or "" when the URL names none. */
export function databaseNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "http://"));
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}
