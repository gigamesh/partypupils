"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";

interface Release {
  id: number;
  name: string;
  slug: string;
  isPublished: boolean;
}

interface Props {
  releases: Release[];
  initialRelease?: Release;
}

export function NewLinkPageForm({ releases, initialRelease }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialRelease?.name ?? "");
  const [slug, setSlug] = useState(initialRelease?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialRelease));
  const [description, setDescription] = useState("");
  const [releaseId, setReleaseId] = useState<string>(
    initialRelease ? String(initialRelease.id) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/link-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        slug,
        description: description || null,
        releaseId: releaseId ? Number(releaseId) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create link page");
      setSaving(false);
      return;
    }
    router.push(`/admin/link-pages/${data.id}/edit`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-1.5">
        <Label htmlFor="lp-title">Title</Label>
        <Input
          id="lp-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Summer Release"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lp-slug">Slug</Label>
        <Input
          id="lp-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="summer-release"
          required
          pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
        />
        <p className="text-xs text-muted-foreground">
          Public URL: <code>/links/{slug || "your-slug"}</code>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lp-release">Release (optional)</Label>
        <select
          id="lp-release"
          value={releaseId}
          onChange={(e) => setReleaseId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {releases.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {!r.isPublished && " (draft)"}
            </option>
          ))}
        </select>
        {(() => {
          const picked = releaseId
            ? releases.find((r) => r.id === Number(releaseId))
            : null;
          if (picked && !picked.isPublished) {
            return (
              <p className="text-xs text-destructive">
                This release is a draft and is hidden from the storefront. Publish
                it before sharing this link page.
              </p>
            );
          }
          return null;
        })()}
        <p className="text-xs text-muted-foreground">
          When set, the page falls back to the release&rsquo;s cover image.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lp-description">Description (optional)</Label>
        <Textarea
          id="lp-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !title || !slug}>
          {saving ? "Creating..." : "Create"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/link-pages")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
