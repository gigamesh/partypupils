import { relations } from "drizzle-orm";
import * as gigamusicDb from "@gigamusic/db/schema";

export * from "@gigamusic/db/schema";

// Override the upstream `releasesRelations` so `releases.linkPages` is reachable
// via the relational query API. As of @gigamusic/db 4.x the link-page tables and
// relations live here (they moved out of @gigamusic/links/schema), but the
// bundled `releasesRelations` still only wires `tracks` + `orderItems`, so we
// add the reverse `linkPages` direction. This local `export const` shadows the
// star-exported one above — the intended extension pattern.
export const releasesRelations = relations(gigamusicDb.releases, ({ many }) => ({
  tracks: many(gigamusicDb.tracks),
  orderItems: many(gigamusicDb.orderItems),
  linkPages: many(gigamusicDb.linkPages),
}));
