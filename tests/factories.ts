/** Tiny factories for test data. Keep these minimal — explicit data in tests reads better. */
import { db } from "@/lib/db";
import {
  downloadTokens,
  orderItems,
  orders,
  releases,
  trackFiles,
  tracks,
} from "@/db/schema";

export async function makeRelease(overrides: Partial<{
  name: string;
  slug: string;
  price: number;
  type: "single" | "album";
  isPublished: boolean;
  coverImageUrl: string;
}> = {}) {
  const [release] = await db
    .insert(releases)
    .values({
      name: overrides.name ?? "Test Release",
      slug: overrides.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`,
      price: overrides.price ?? 999,
      type: overrides.type ?? "single",
      isPublished: overrides.isPublished ?? true,
      coverImageUrl: overrides.coverImageUrl,
    })
    .returning();
  return release!;
}

export async function makeTrackWithFile(releaseId: number, overrides: Partial<{
  name: string;
  trackNumber: number;
  price: number;
  storageKey: string;
  fileName: string;
}> = {}) {
  return db.transaction(async (tx) => {
    const [track] = await tx
      .insert(tracks)
      .values({
        releaseId,
        name: overrides.name ?? "Test Track",
        slug: `track-${Math.random().toString(36).slice(2, 10)}`,
        trackNumber: overrides.trackNumber ?? 1,
        price: overrides.price ?? 150,
      })
      .returning();
    const [file] = await tx
      .insert(trackFiles)
      .values({
        trackId: track!.id,
        format: "mp3",
        fileName: overrides.fileName ?? `${overrides.name ?? "track"}.mp3`,
        storageKey:
          overrides.storageKey ??
          `https://r2.example/${Math.random().toString(36).slice(2, 8)}.mp3`,
        fileSize: 1234,
      })
      .returning();
    return { ...track!, files: [file!] };
  });
}

export async function makeCompletedOrder(opts: {
  email: string;
  trackIds?: number[];
  releaseIds?: number[];
}) {
  const itemValues = [
    ...(opts.trackIds ?? []).map((trackId) => ({ trackId, price: 150 })),
    ...(opts.releaseIds ?? []).map((releaseId) => ({ releaseId, price: 999 })),
  ];

  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        stripeSessionId: `cs_test_${Math.random().toString(36).slice(2, 10)}`,
        email: opts.email,
        amountTotal: itemValues.reduce((s, i) => s + i.price, 0),
        status: "completed",
      })
      .returning();

    const items = itemValues.length
      ? await tx
          .insert(orderItems)
          .values(itemValues.map((v) => ({ ...v, orderId: order!.id })))
          .returning()
      : [];

    const [token] = await tx
      .insert(downloadTokens)
      .values({ orderId: order!.id })
      .returning();

    return { ...order!, items, downloadTokens: [token!] };
  });
}
