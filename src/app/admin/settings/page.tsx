import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases, siteSettings } from "@/db/schema";
import {
  CATALOG_DISCOUNT_KEY,
  DEFAULT_DISCOUNT_PERCENT,
  FEATURED_SONG_KEY,
} from "@/lib/constants";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [discountSetting, featuredSetting, releaseRows] = await Promise.all([
    db.query.siteSettings.findFirst({
      where: eq(siteSettings.key, CATALOG_DISCOUNT_KEY),
    }),
    db.query.siteSettings.findFirst({
      where: eq(siteSettings.key, FEATURED_SONG_KEY),
    }),
    // Only published releases: featuring a draft song would point the card at a
    // page the storefront doesn't serve.
    db.query.releases.findMany({
      where: eq(releases.isPublished, true),
      columns: { id: true, name: true },
      with: {
        tracks: {
          columns: { id: true, name: true, trackNumber: true },
          orderBy: (t, { asc }) => asc(t.trackNumber),
        },
      },
      orderBy: asc(releases.name),
    }),
  ]);

  const songs = releaseRows.flatMap((release) =>
    release.tracks.map((track) => ({
      id: track.id,
      label: `${track.name} — ${release.name}`,
    })),
  );
  songs.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div>
      <h1>Settings</h1>
      <SettingsForm
        catalogDiscount={discountSetting?.value || String(DEFAULT_DISCOUNT_PERCENT)}
        featuredSongId={featuredSetting?.value ?? ""}
        songs={songs}
      />
    </div>
  );
}
