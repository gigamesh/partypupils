import { describe, it, expect } from "vitest";
import {
  TEST_DATABASE_SUFFIX,
  databaseNameFromUrl,
  testDatabaseUrl,
} from "../../scripts/test-db-url";

const DEV = "postgresql://postgres:pw@localhost:5436/party_pupils";

describe("testDatabaseUrl", () => {
  it("appends the test suffix to the database name", () => {
    expect(testDatabaseUrl(DEV)).toEqual({
      url: "postgresql://postgres:pw@localhost:5436/party_pupils_test",
      database: "party_pupils_test",
    });
  });

  it("preserves credentials, host, port and query string", () => {
    const { url } = testDatabaseUrl(`${DEV}?sslmode=disable&connect_timeout=5`);
    expect(url).toBe(
      "postgresql://postgres:pw@localhost:5436/party_pupils_test?sslmode=disable&connect_timeout=5",
    );
  });

  it("is idempotent — an already-suffixed name is left alone", () => {
    const once = testDatabaseUrl(DEV).url;
    expect(testDatabaseUrl(once).url).toBe(once);
  });

  it("keeps the postgres:// scheme when that is what came in", () => {
    expect(testDatabaseUrl("postgres://u:p@localhost:5432/app").url).toBe(
      "postgres://u:p@localhost:5432/app_test",
    );
  });

  it("swaps in an explicit name for the maintenance connection", () => {
    expect(testDatabaseUrl(DEV, "postgres")).toEqual({
      url: "postgresql://postgres:pw@localhost:5436/postgres",
      database: "postgres",
    });
  });
});

describe("databaseNameFromUrl", () => {
  it("reads the database name", () => {
    expect(databaseNameFromUrl(DEV)).toBe("party_pupils");
    expect(databaseNameFromUrl(`${DEV}_test?x=1`)).toBe("party_pupils_test");
  });

  it("returns an empty string when there is no name or the URL is junk", () => {
    expect(databaseNameFromUrl("postgresql://localhost:5432")).toBe("");
    expect(databaseNameFromUrl("not a url")).toBe("");
  });

  it("never reports a dev database as test-suffixed", () => {
    // This pairing is the guard in tests/setup.ts; if it ever passes for the
    // dev URL, the suite would truncate the developer's local catalog.
    expect(databaseNameFromUrl(DEV).endsWith(TEST_DATABASE_SUFFIX)).toBe(false);
    expect(databaseNameFromUrl(testDatabaseUrl(DEV).url).endsWith(TEST_DATABASE_SUFFIX)).toBe(true);
  });
});
