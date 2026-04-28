/** Tiny factories for test data. Keep these minimal — explicit data in tests reads better. */
import { prisma } from "@/lib/db";

export async function makeRelease(overrides: Partial<{
  name: string;
  slug: string;
  price: number;
  type: "single" | "album";
  isPublished: boolean;
}> = {}) {
  return prisma.release.create({
    data: {
      name: overrides.name ?? "Test Release",
      slug: overrides.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`,
      price: overrides.price ?? 999,
      type: overrides.type ?? "single",
      isPublished: overrides.isPublished ?? true,
    },
  });
}

export async function makeTrackWithFile(releaseId: number, overrides: Partial<{
  name: string;
  trackNumber: number;
  price: number;
  storageKey: string;
}> = {}) {
  return prisma.track.create({
    data: {
      releaseId,
      name: overrides.name ?? "Test Track",
      trackNumber: overrides.trackNumber ?? 1,
      price: overrides.price ?? 150,
      files: {
        create: [
          {
            format: "mp3",
            fileName: `${overrides.name ?? "track"}.mp3`,
            storageKey: overrides.storageKey ?? `https://r2.example/${Math.random().toString(36).slice(2, 8)}.mp3`,
            fileSize: 1234,
          },
        ],
      },
    },
    include: { files: true },
  });
}

export async function makeCompletedOrder(opts: {
  email: string;
  trackIds?: number[];
  releaseIds?: number[];
}) {
  const items = [
    ...(opts.trackIds ?? []).map((trackId) => ({ trackId, price: 150 })),
    ...(opts.releaseIds ?? []).map((releaseId) => ({ releaseId, price: 999 })),
  ];
  return prisma.order.create({
    data: {
      stripeSessionId: `cs_test_${Math.random().toString(36).slice(2, 10)}`,
      email: opts.email,
      amountTotal: items.reduce((s, i) => s + i.price, 0),
      status: "completed",
      items: { create: items },
      downloadTokens: { create: {} },
    },
    include: { items: true, downloadTokens: true },
  });
}
