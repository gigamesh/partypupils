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
    prisma.release.deleteMany(),
    prisma.siteSetting.deleteMany(),
    prisma.link.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
