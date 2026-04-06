"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsFormProps {
  catalogDiscount: string;
}

export function SettingsForm({ catalogDiscount }: SettingsFormProps) {
  const [discount, setDiscount] = useState(catalogDiscount);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setLoading(true);
    setSaved(false);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "catalog_discount_percent", value: discount }),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
          {saved && <span className="text-sm text-neon self-center">Saved</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Discount applied when customers buy the entire catalog.
        </p>
      </div>
    </div>
  );
}
