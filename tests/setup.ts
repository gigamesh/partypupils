/**
 * Global test setup. Tests are launched via `scripts/run-tests.ts`, which:
 *   - guarantees DATABASE_URL points to localhost
 *   - redirects it onto a sibling `*_test` database, creating it if needed
 *   - has already run `drizzle-kit push` against that database
 *
 * This file therefore only handles per-test data isolation and module mocks.
 */
import "@dotenvx/dotenvx/config";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TEST_DATABASE_SUFFIX, databaseNameFromUrl } from "../scripts/test-db-url";
import {
  downloadTokens,
  linkPageItems,
  linkPages,
  links,
  orderItems,
  orders,
  rateLimits,
  releases,
  siteSettings,
  trackFiles,
  tracks,
} from "@/db/schema";

// Belt-and-suspenders: never run against a Neon URL even if invoked outside the wrapper.
if (process.env.DATABASE_URL?.includes("neon.tech")) {
  throw new Error(
    "Refusing to run tests against a Neon database. Use `pnpm test` so the wrapper isolates onto the *_test database.",
  );
}

// The `beforeEach` below deletes every row in the catalog, so the one thing
// that must never be wrong is *which* database we are pointed at. Running
// `npx vitest` directly skips the wrapper and inherits the dev DATABASE_URL —
// which is exactly how the dev catalog got wiped before this guard existed.
const targetDatabase = databaseNameFromUrl(process.env.DATABASE_URL ?? "");
if (!targetDatabase.endsWith(TEST_DATABASE_SUFFIX)) {
  throw new Error(
    `Refusing to run tests against database "${targetDatabase || "(none)"}": the name must end in ` +
      `"${TEST_DATABASE_SUFFIX}". Tests truncate every table between cases, so they only ever run on ` +
      `the dedicated test database. Use \`pnpm test\` (or \`pnpm test:watch\`), which points ` +
      `DATABASE_URL at it — running \`npx vitest\` directly inherits the dev database and would ` +
      `destroy your local catalog.`,
  );
}

// Admin-auth: every protected route sees an authed admin by default. Re-mock per test for 401 paths.
vi.mock("@/lib/admin-auth", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  adminSessionCookieOptions: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  },
  verifyAdminSession: vi.fn(async () => true),
  verifyAdminSessionFromRequest: vi.fn(async () => ({
    authed: true,
    refreshedToken: null,
  })),
  createAdminSession: vi.fn(async () => {}),
  clearAdminSession: vi.fn(async () => {}),
}));

// Stub external services. Stripe stub is a singleton so vi.mocked(stripe().X) and the
// route handler's stripe().X reference the same fn — otherwise the handler sees a fresh
// vi.fn() while tests configure a different one. The same stub also backs
// `new Stripe()` calls made by the gigamusic checkout handler.
const { stripeStub, emailSendStub } = vi.hoisted(() => ({
  stripeStub: {
    // `retrieve` backs the success page's on-demand fulfillment, which reads the
    // session straight from Stripe rather than waiting for the webhook.
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
  // Shared `send` mock backing `emailProvider().send(...)`. Tests can grab it
  // via the exported `emailProvider` mock to assert call counts / mockRejected.
  emailSendStub: vi.fn<(message?: unknown) => Promise<void>>(async () => {}),
}));
export { emailSendStub };
vi.mock("@/lib/stripe", () => ({
  stripe: () => stripeStub,
}));
vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = stripeStub.checkout;
    webhooks = stripeStub.webhooks;
  },
}));

vi.mock("@/lib/email", () => ({
  sendOrderLookupEmail: vi.fn(async () => {}),
  sendContactEmail: vi.fn(async () => {}),
  // Routes through the shared `emailSendStub` (rather than being its own vi.fn)
  // so reissue tests can assert the rendered subject/recipient and simulate a
  // provider outage the same way every other email test does.
  sendDownloadReissueEmail: vi.fn(
    async (args: {
      to: string;
      verifyUrl: string;
      itemNames: string[];
      totalCents: number;
      expiryDays: number;
    }) => {
      await emailSendStub({
        to: args.to,
        subject: "Your Test Download Link",
        html: `<html>${args.verifyUrl}</html>`,
      });
    },
  ),
  renderDownloadReissue: vi.fn(() => ({ subject: "", html: "<html></html>" })),
  emailProvider: vi.fn(() => ({
    send: emailSendStub,
  })),
  EMAIL_BRANDING: { siteName: "Test", themeColor: "#000000" },
  orderLookupEmailHtml: vi.fn(() => "<html></html>"),
  purchaseConfirmationEmailHtml: vi.fn(() => "<html></html>"),
  contactEmailHtml: vi.fn(() => "<html></html>"),
}));

// next/cache primitives need a Next.js render store at runtime; in vitest there isn't one.
// Mock to no-ops so route handlers can call them without crashing. Tests can spy via vi.mocked.
vi.mock("next/cache", async () => {
  const actual = await vi.importActual<typeof import("next/cache")>("next/cache");
  return {
    ...actual,
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    unstable_cache: <T extends (...args: unknown[]) => unknown>(cb: T) => cb,
  };
});

// `after` from next/server requires a request scope; in vitest there isn't one.
// Run the callback immediately so tests see its side effects (email sends, logs).
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: vi.fn((cb: () => unknown | Promise<unknown>) => {
      Promise.resolve().then(cb).catch(() => {});
    }),
  };
});

// `next/headers.cookies()` also needs a Next request scope. The gigamusic
// admin handlers (`createAdminUploadProcessHandler`, etc.) verify the
// session by calling `cookies().get("admin_session")`, so without a stub
// they throw "cookies was called outside a request scope" before any test
// assertion runs. Stub it with a synthetic jar that returns a freshly
// signed admin session token — `isAdminAuthenticated(secret)` then verifies
// against the same ADMIN_SECRET the route reads.
const { adminSessionToken } = vi.hoisted(() => ({
  adminSessionToken: { current: "" as string },
}));
vi.mock("next/headers", async () => {
  const { signSessionToken } = await import("@gigamusic/core");
  adminSessionToken.current = await signSessionToken({
    payload: { admin: true },
    secret: process.env.ADMIN_SECRET ?? "",
  });
  return {
    cookies: async () => ({
      get(name: string) {
        if (name === "admin_session") {
          return { name, value: adminSessionToken.current };
        }
        return undefined;
      },
      set: () => {},
    }),
  };
});

// Storage stub — never hit R2 in tests. `storageProvider()` returns a
// `StorageProvider`-shaped object whose methods are vi.fns, so tests can grab
// the gigamusic factories' transitive calls via `vi.mocked(storageProvider()).<fn>`.
vi.mock("@/lib/storage", async () => {
  const { Readable } = await import("stream");
  const deleteFile = vi.fn(async () => {});
  const uploadBuffer = vi.fn(async () => ({ url: "https://r2/stub", storageKey: "https://r2/stub" }));
  const uploadStream = vi.fn(async () => ({ url: "https://r2/stub", storageKey: "https://r2/stub" }));
  const getPresignedUploadUrl = vi.fn(async () => ({ url: "https://r2/presign", publicUrl: "https://r2/stub" }));
  const getPresignedDownloadUrl = vi.fn(async () => "https://r2/signed?response-content-disposition=stub");
  const getFileBuffer = vi.fn(async () => Buffer.from(""));
  const getFileStream = vi.fn(async () => Readable.from(Buffer.from("")));
  const keyFromPublicUrl = vi.fn((url: string) => url);
  const publicUrlFromKey = vi.fn((key: string) => key);
  const providerStub = {
    uploadBuffer,
    uploadStream,
    getPresignedUploadUrl,
    getPresignedDownloadUrl,
    getFileBuffer,
    getFileStream,
    deleteFile,
    keyFromPublicUrl,
    publicUrlFromKey,
  };
  return {
    deleteFile,
    getPresignedDownloadUrl,
    storageProvider: () => providerStub,
  };
});

beforeAll(async () => {
  // Sanity check the connection up front — clearer than test-time timeouts.
  await db.execute(sql`SELECT 1`);
});

beforeEach(async () => {
  // Wipe between tests. The order respects FK constraints (children before
  // parents). Wrapping in a single transaction keeps the deletes atomic, the
  // same property the Prisma `$transaction([...])` form provided.
  await db.transaction(async (tx) => {
    await tx.delete(trackFiles);
    await tx.delete(orderItems);
    await tx.delete(downloadTokens);
    await tx.delete(tracks);
    await tx.delete(orders);
    await tx.delete(linkPageItems);
    await tx.delete(linkPages);
    await tx.delete(releases);
    await tx.delete(siteSettings);
    await tx.delete(links);
    await tx.delete(rateLimits);
  });

  // Reset all stripeStub mocks between tests so prior calls don't leak.
  stripeStub.checkout.sessions.create.mockReset();
  stripeStub.webhooks.constructEvent.mockReset();
  emailSendStub.mockReset();
  emailSendStub.mockResolvedValue(undefined);
});

afterAll(async () => {
  // Drizzle's `pg`/`neon` pools don't expose a `$disconnect`; the underlying
  // pool is GC'd when the process exits. Vitest forks shut down cleanly with
  // no explicit close needed, mirroring the previous Prisma teardown.
});
