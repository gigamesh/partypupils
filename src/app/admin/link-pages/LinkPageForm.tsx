"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { detectLinkPlatform, PlatformIcon } from "@/lib/link-platforms";

interface LinkItem {
  id: number;
  title: string;
  url: string;
  position: number;
  isVisible: boolean;
}

interface ReleaseOption {
  id: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
}

interface LinkPage {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  releaseId: number | null;
  isPublished: boolean;
  items: LinkItem[];
  release: ReleaseOption | null;
}

interface Props {
  page: LinkPage;
  releases: ReleaseOption[];
}

export function LinkPageForm({ page, releases }: Props) {
  const router = useRouter();

  // Page meta
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [description, setDescription] = useState(page.description ?? "");
  const [releaseId, setReleaseId] = useState<string>(
    page.releaseId ? String(page.releaseId) : "",
  );
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(
    page.coverImageUrl,
  );
  const [isPublished, setIsPublished] = useState(page.isPublished);
  const [pageSaving, setPageSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const pageDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Items
  const [items, setItems] = useState<LinkItem[]>(page.items);
  const [savingItemIds, setSavingItemIds] = useState<Set<number>>(new Set());
  const itemDebounceTimers = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  // Resolved cover (for preview): override → release → null
  const selectedRelease = releaseId
    ? releases.find((r) => r.id === Number(releaseId)) ?? null
    : null;
  const resolvedCover = coverImageUrl ?? selectedRelease?.coverImageUrl ?? null;

  async function savePage(updates: Record<string, unknown>) {
    setPageSaving(true);
    setPageError("");
    const res = await fetch(`/api/admin/link-pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      setPageError(data.error ?? "Failed to save");
    }
    setPageSaving(false);
    router.refresh();
  }

  function debouncedSavePage(updates: Record<string, unknown>) {
    if (pageDebounceRef.current) clearTimeout(pageDebounceRef.current);
    pageDebounceRef.current = setTimeout(() => savePage(updates), 500);
  }

  async function uploadCover(file: File) {
    setUploadingCover(true);
    try {
      const key = `images/link-pages/${page.id}-${Date.now()}-${file.name}`;
      const contentType = file.type || "application/octet-stream";
      const presignRes = await fetch("/api/admin/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType }),
      });
      if (!presignRes.ok) {
        const body = await presignRes.text();
        throw new Error(
          `Failed to get upload URL (${presignRes.status}) for key="${key}" contentType="${contentType}": ${body.slice(0, 300)}`,
        );
      }
      const { url, publicUrl } = await presignRes.json();
      const uploadRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      setCoverImageUrl(publicUrl);
      await savePage({ coverImageUrl: publicUrl });
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  async function clearCoverOverride() {
    setCoverImageUrl(null);
    await savePage({ coverImageUrl: null });
  }

  async function copyPublicUrl() {
    const fullUrl = `${window.location.origin}/links/${slug}`;
    await navigator.clipboard.writeText(fullUrl);
  }

  // Items handlers ---------------------------------------------------------

  async function addItem() {
    if (!newTitle || !newUrl) return;
    const res = await fetch(`/api/admin/link-pages/${page.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, url: newUrl }),
    });
    if (!res.ok) return;
    const item = await res.json();
    setItems([...items, item]);
    setNewTitle("");
    setNewUrl("");
  }

  async function saveItem(item: LinkItem) {
    setSavingItemIds((prev) => new Set(prev).add(item.id));
    await fetch(`/api/admin/link-pages/${page.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        title: item.title,
        url: item.url,
        position: item.position,
        isVisible: item.isVisible,
      }),
    });
    setSavingItemIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  async function deleteItem(id: number) {
    await fetch(`/api/admin/link-pages/${page.id}/items?itemId=${id}`, {
      method: "DELETE",
    });
    setItems(items.filter((i) => i.id !== id));
  }

  function updateItemField(
    id: number,
    field: keyof LinkItem,
    value: string | number | boolean,
  ) {
    const updated = items.map((i) => (i.id === id ? { ...i, [field]: value } : i));
    setItems(updated);

    const existing = itemDebounceTimers.current.get(id);
    if (existing) clearTimeout(existing);

    const item = updated.find((i) => i.id === id)!;
    itemDebounceTimers.current.set(
      id,
      setTimeout(() => {
        itemDebounceTimers.current.delete(id);
        saveItem(item);
      }, 500),
    );
  }

  async function moveItem(index: number, direction: "up" | "down") {
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= items.length) return;

    const next = [...items];
    const tempPos = next[index].position;
    next[index] = { ...next[index], position: next[swap].position };
    next[swap] = { ...next[swap], position: tempPos };
    [next[index], next[swap]] = [next[swap], next[index]];
    setItems(next);

    await Promise.all([
      fetch(`/api/admin/link-pages/${page.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: next[index].id,
          position: next[index].position,
        }),
      }),
      fetch(`/api/admin/link-pages/${page.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: next[swap].id,
          position: next[swap].position,
        }),
      }),
    ]);
  }

  return (
    <div className="space-y-8 mt-4">
      {/* Public URL + status bar */}
      <div className="flex items-center justify-between rounded-lg glass-panel p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Public URL: </span>
          <code className="text-foreground">/links/{slug}</code>
          {pageSaving && (
            <span className="ml-3 text-xs text-muted-foreground">Saving...</span>
          )}
          {pageError && (
            <span className="ml-3 text-xs text-destructive">{pageError}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyPublicUrl}>
            Copy URL
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = !isPublished;
              setIsPublished(next);
              savePage({ isPublished: next });
            }}
          >
            {isPublished ? "Published" : "Draft"}
          </Button>
        </div>
      </div>

      {/* Page metadata */}
      <div className="space-y-4 rounded-lg glass-panel p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="lp-title">Title</Label>
            <Input
              id="lp-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                debouncedSavePage({ title: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lp-slug">Slug</Label>
            <Input
              id="lp-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                debouncedSavePage({ slug: e.target.value });
              }}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-description">Description</Label>
          <Textarea
            id="lp-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              debouncedSavePage({ description: e.target.value || null });
            }}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-release">Release</Label>
          <select
            id="lp-release"
            value={releaseId}
            onChange={(e) => {
              setReleaseId(e.target.value);
              savePage({ releaseId: e.target.value ? Number(e.target.value) : null });
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Cover image</Label>
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
                  onClick={clearCoverOverride}
                  className="self-start"
                >
                  Clear override
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {coverImageUrl
                  ? "Custom override active."
                  : selectedRelease?.coverImageUrl
                    ? "Using release cover. Upload to override."
                    : "Upload a cover or link a release."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Links on this page
        </h2>
        {items.map((item, index) => {
          const platform = detectLinkPlatform(item.url);
          return (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-lg glass-panel p-3"
            >
              <div className="flex flex-col gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === 0}
                  onClick={() => moveItem(index, "up")}
                >
                  ▲
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, "down")}
                >
                  ▼
                </Button>
              </div>
              <div className="w-6 h-6 flex items-center justify-center text-muted-foreground shrink-0 mt-1">
                {platform ? <PlatformIcon platform={platform} size={20} /> : "—"}
              </div>
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2">
                <Input
                  value={item.title}
                  onChange={(e) => updateItemField(item.id, "title", e.target.value)}
                  placeholder="Title"
                  className="w-full sm:flex-1 min-w-0"
                />
                <Input
                  value={item.url}
                  onChange={(e) => updateItemField(item.id, "url", e.target.value)}
                  placeholder="https://..."
                  className="w-full sm:flex-1 min-w-0"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateItemField(item.id, "isVisible", !item.isVisible)}
                  >
                    {item.isVisible ? "Visible" : "Hidden"}
                  </Button>
                  {savingItemIds.has(item.id) && (
                    <span className="text-xs text-muted-foreground">Saving...</span>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteItem(item.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg glass-panel border-dashed p-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Spotify, Apple Music, etc."
            className="w-full sm:flex-1 min-w-0"
          />
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            className="w-full sm:flex-1 min-w-0"
          />
          <Button onClick={addItem} disabled={!newTitle || !newUrl}>
            Add Link
          </Button>
        </div>
      </div>
    </div>
  );
}
