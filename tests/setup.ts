/**
 * Global test setup. Tests are launched via `scripts/run-tests.ts`, which:
 *   - guarantees DATABASE_URL points to localhost
 *   - rewrites the URL onto an isolated Postgres `schema=test`
 *   - has already run `prisma db push --force-reset` against that schema
 *
 * This file therefore only handles per-test data isolation and module mocks.
 */
import "dotenv/config";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";

// Belt-and-suspenders: never run against a Neon URL even if invoked outside the wrapper.
if (process.env.DATABASE_URL?.includes("neon.tech")) {
  throw new Error(
    "Refusing to run tests against a Neon database. Use `npm test` so the wrapper isolates onto schema=test.",
  );
}

// Admin-auth: every protected route sees an authed admin by default. Re-mock per test for 401 paths.
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminSession: vi.fn(async () => true),
  createAdminSession: vi.fn(async () => {}),
}));

// Stub external services. Stripe stub is a singleton so vi.mocked(stripe().X) and the
// route handler's stripe().X reference the same fn — otherwise the handler sees a fresh
// vi.fn() while tests configure a different one.
const stripeStub = {
  checkout: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
};
vi.mock("@/lib/stripe", () => ({
  stripe: () => stripeStub,
}));

vi.mock("@/lib/email", () => ({
  sendPurchaseConfirmationEmail: vi.fn(async () => {}),
  sendOrderLinkEmail: vi.fn(async () => {}),
  sendContactEmail: vi.fn(async () => {}),
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

// Storage stub — never hit R2 in tests. Tests can spy on `deleteFile` via vi.mocked.
vi.mock("@/lib/storage", async () => {
  const { Readable } = await import("stream");
  return {
    deleteFile: vi.fn(async () => {}),
    uploadFile: vi.fn(async () => ({ url: "https://r2/stub", storageKey: "https://r2/stub" })),
    uploadBuffer: vi.fn(async () => ({ url: "https://r2/stub", storageKey: "https://r2/stub" })),
    uploadStream: vi.fn(async () => ({ url: "https://r2/stub", storageKey: "https://r2/stub" })),
    getPresignedUploadUrl: vi.fn(async () => ({ url: "https://r2/presign", publicUrl: "https://r2/stub" })),
    getPresignedDownloadUrl: vi.fn(async () => "https://r2/signed?response-content-disposition=stub"),
    getFileBuffer: vi.fn(async () => Buffer.from("")),
    getFileStream: vi.fn(async () => Readable.from(Buffer.from(""))),
    keyFromPublicUrl: vi.fn((url: string) => url),
  };
});

beforeAll(async () => {
  // Sanity check the connection up front — clearer than test-time timeouts.
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  // Reset all stripeStub mocks between tests so prior calls don't leak.
  stripeStub.checkout.sessions.create.mockReset();
  stripeStub.webhooks.constructEvent.mockReset();

  // Wipe between tests. deleteMany via the Prisma client (rather than raw TRUNCATE) avoids
  // an issue where Prisma misparses parameter placeholders in raw SQL with quoted identifiers.
  await prisma.$transaction([
    prisma.trackFile.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.downloadToken.deleteMany(),
    prisma.track.deleteMany(),
    prisma.order.deleteMany(),
    prisma.linkPageItem.deleteMany(),
    prisma.linkPage.deleteMany(),
    prisma.release.deleteMany(),
    prisma.siteSetting.deleteMany(),
    prisma.link.deleteMany(),
    prisma.rateLimit.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
