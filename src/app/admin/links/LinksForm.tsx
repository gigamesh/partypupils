"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LinkItem {
  id: number;
  title: string;
  url: string;
  position: number;
  isVisible: boolean;
  showOnHero: boolean;
}

interface LinksFormProps {
  initialLinks: LinkItem[];
}

export function LinksForm({ initialLinks }: LinksFormProps) {
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const debounceTimers = useState<Map<number, NodeJS.Timeout>>(new Map())[0];

  async function addLink() {
    if (!newTitle || !newUrl) return;
    const res = await fetch("/api/admin/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, url: newUrl }),
    });
    const link = await res.json();
    setLinks([...links, link]);
    setNewTitle("");
    setNewUrl("");
  }

  async function saveLink(link: LinkItem) {
    setSaving((prev) => new Set(prev).add(link.id));
    await fetch("/api/admin/links", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(link),
    });
    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(link.id);
      return next;
    });
  }

  async function deleteLink(id: number) {
    await fetch(`/api/admin/links?id=${id}`, { method: "DELETE" });
    setLinks(links.filter((l) => l.id !== id));
  }

  function updateField(id: number, field: keyof LinkItem, value: string | number | boolean) {
    const updated = links.map((l) => (l.id === id ? { ...l, [field]: value } : l));
    setLinks(updated);

    const existing = debounceTimers.get(id);
    if (existing) clearTimeout(existing);

    const link = updated.find((l) => l.id === id)!;
    debounceTimers.set(
      id,
      setTimeout(() => {
        debounceTimers.delete(id);
        saveLink(link);
      }, 500),
    );
  }

  async function moveLink(currentIndex: number, direction: "up" | "down") {
    const newLinks = [...links];
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    const tempPos = newLinks[currentIndex].position;
    newLinks[currentIndex].position = newLinks[swapIndex].position;
    newLinks[swapIndex].position = tempPos;

    [newLinks[currentIndex], newLinks[swapIndex]] = [
      newLinks[swapIndex],
      newLinks[currentIndex],
    ];

    setLinks(newLinks);

    await Promise.all([
      fetch("/api/admin/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newLinks[currentIndex].id,
          position: newLinks[currentIndex].position,
        }),
      }),
      fetch("/api/admin/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newLinks[swapIndex].id,
          position: newLinks[swapIndex].position,
        }),
      }),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {links.map((link, index) => (
          <div
            key={link.id}
            className="flex items-center gap-3 rounded-lg glass-panel p-3"
          >
            <div className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === 0}
                onClick={() => moveLink(index, "up")}
              >
                ▲
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === links.length - 1}
                onClick={() => moveLink(index, "down")}
              >
                ▼
              </Button>
            </div>
            <Input
              value={link.title}
              onChange={(e) => updateField(link.id, "title", e.target.value)}
              placeholder="Title"
              className="flex-1"
            />
            <Input
              value={link.url}
              onChange={(e) => updateField(link.id, "url", e.target.value)}
              placeholder="URL"
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateField(link.id, "isVisible", !link.isVisible)}
            >
              {link.isVisible ? "Visible" : "Hidden"}
            </Button>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={link.showOnHero}
                onChange={() => updateField(link.id, "showOnHero", !link.showOnHero)}
                className="accent-neon"
              />
              homepage
            </label>
            {saving.has(link.id) && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteLink(link.id)}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-lg glass-panel border-dashed p-3">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Link title"
          className="flex-1"
        />
        <Input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://..."
          className="flex-1"
        />
        <Button onClick={addLink} disabled={!newTitle || !newUrl}>
          Add Link
        </Button>
      </div>
    </div>
  );
}
