"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_DISCOUNT_KEY, FEATURED_SONG_KEY } from "@/lib/constants";

interface SongOption {
  id: number;
  label: string;
}

interface SettingsFormProps {
  catalogDiscount: string;
  /** Track id of the featured song, or "" when none is set. */
  featuredSongId: string;
  songs: SongOption[];
}

export function SettingsForm({ catalogDiscount, featuredSongId, songs }: SettingsFormProps) {
  const [discount, setDiscount] = useState(catalogDiscount);
  const [featured, setFeatured] = useState(featuredSongId);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  /** Persist one settings key, flashing "Saved" beside that field only. */
  async function save(key: string, value: string) {
    setSavingKey(key);
    setSavedKey(null);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSavingKey(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 3000);
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-2">
        <Label htmlFor="discount">Catalog Discount (%)</Label>
        <div className="flex gap-3">
          <Input
            id="discount"
            type="number"
            min="0"
            max="100"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="max-w-24"
          />
          <Button
            onClick={() => save(CATALOG_DISCOUNT_KEY, discount)}
            disabled={savingKey === CATALOG_DISCOUNT_KEY}
          >
            {savingKey === CATALOG_DISCOUNT_KEY ? "Saving..." : "Save"}
          </Button>
          {savedKey === CATALOG_DISCOUNT_KEY && (
            <span className="text-sm text-neon self-center">Saved</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Discount applied when customers buy the entire catalog.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="featured-song">Featured Song</Label>
        <div className="flex gap-3">
          <select
            id="featured-song"
            value={featured}
            onChange={(e) => setFeatured(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {songs.map((song) => (
              <option key={song.id} value={song.id}>
                {song.label}
              </option>
            ))}
          </select>
          <Button
            onClick={() => save(FEATURED_SONG_KEY, featured)}
            disabled={savingKey === FEATURED_SONG_KEY}
          >
            {savingKey === FEATURED_SONG_KEY ? "Saving..." : "Save"}
          </Button>
          {savedKey === FEATURED_SONG_KEY && (
            <span className="text-sm text-neon self-center">Saved</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Shown in its own row above the release grid on the music page.
        </p>
      </div>
    </div>
  );
}
