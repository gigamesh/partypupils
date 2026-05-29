import { relations } from "drizzle-orm";
import * as gigamusicDb from "@gigamusic/db/schema";
import * as gigamusicLinks from "@gigamusic/links/schema";

export * from "@gigamusic/db/schema";
export * from "@gigamusic/links/schema";

// Override the upstream `releasesRelations` so `releases.linkPages` is reachable
// via the relational query API. `@gigamusic/links/schema` already declares the
// forward `linkPages.release` direction.
export const releasesRelations = relations(gigamusicDb.releases, ({ many }) => ({
  tracks: many(gigamusicDb.tracks),
  orderItems: many(gigamusicDb.orderItems),
  linkPages: many(gigamusicLinks.linkPages),
}));
