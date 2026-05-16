import { prisma } from "./db";

/**
 * Returns true if the given download token belongs to a completed order that
 * grants access to `trackId` — either because the track was purchased
 * individually, or because its parent release was purchased.
 *
 * Shared by:
 *   - GET /download/[token]              (file delivery)
 *   - GET /music/[slug]/[trackSlug]      (decides whether to render download UI)
 */
export async function tokenGrantsTrack(
  token: string,
  trackId: number,
  releaseId: number,
): Promise<boolean> {
  const downloadToken = await prisma.downloadToken.findUnique({
    where: { token },
    select: {
      order: {
        select: {
          items: { select: { trackId: true, releaseId: true } },
        },
      },
    },
  });

  if (!downloadToken) return false;

  return downloadToken.order.items.some(
    (item) => item.trackId === trackId || item.releaseId === releaseId,
  );
}
