import { queries } from "./db";

/**
 * Returns true if the given download token belongs to a completed order that
 * grants access to `trackId` — either because the track was purchased
 * individually, or because its parent release was purchased.
 */
export async function tokenGrantsTrack({
  token,
  trackId,
}: {
  token: string;
  trackId: number;
}): Promise<boolean> {
  return queries.tokenGrantsTrack(token, trackId);
}
