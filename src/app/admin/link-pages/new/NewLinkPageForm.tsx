"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";
import { presignAndUpload } from "@/lib/upload-client";

interface Release {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
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
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedRelease = releaseId
    ? releases.find((r) => r.id === Number(releaseId)) ?? null
    : null;
  const resolvedCover = coverImageUrl ?? selectedRelease?.coverImageUrl ?? null;

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function uploadCover(file: File) {
    setUploadingCover(true);
    setError("");
    try {
      const key = `images/link-pages/new-${Date.now()}-${file.name}`;
      const publicUrl = await presignAndUpload(file, key);
      setCoverImageUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
    }
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
        coverImageUrl,
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
        <Label>Cover image (optional)</Label>
        <div className="flex items-start gap-4">
          {resolvedCover ? (
            <div className="w-24 h-24 rounded-md overflow-hidden ring-1 ring-white/20 shrink-0">
              <Image
                src={resolvedCover}
                alt="Cover"
                width={200}
                height={200}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-md border border-dashed border-white/20 flex items-center justify-center text-xs text-muted-foreground shrink-0">
              No cover
            </div>
          )}
          <div className="flex flex-col gap-2 text-sm">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover(file);
              }}
              disabled={uploadingCover}
            />
            {coverImageUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCoverImageUrl(null)}
                className="self-start"
              >
                Clear override
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {uploadingCover
                ? "Uploading..."
                : coverImageUrl
                  ? "Custom override active."
                  : selectedRelease?.coverImageUrl
                    ? "Using release cover. Upload to override."
                    : "Upload a cover or link a release."}
            </p>
          </div>
        </div>
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
        <Button
          type="submit"
          disabled={saving || uploadingCover || !title || !slug}
        >
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
