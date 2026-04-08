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
}

interface LinksFormProps {
  initialLinks: LinkItem[];
}

export function LinksForm({ initialLinks }: LinksFormProps) {
  const [links, setLinks] = useState<LinkItem[]>(initialLinks);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

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

  async function updateLink(link: LinkItem) {
    setSaving(link.id);
    await fetch("/api/admin/links", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(link),
    });
    setSaving(null);
  }

  async function deleteLink(id: number) {
    await fetch(`/api/admin/links?id=${id}`, { method: "DELETE" });
    setLinks(links.filter((l) => l.id !== id));
  }

  function updateField(id: number, field: keyof LinkItem, value: string | number | boolean) {
    setLinks(links.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-3 rounded-lg glass-panel p-3"
          >
            <Input
              value={link.position}
              onChange={(e) => updateField(link.id, "position", Number(e.target.value))}
              className="w-16 text-center"
              type="number"
            />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateLink(link)}
              disabled={saving === link.id}
            >
              {saving === link.id ? "Saving..." : "Save"}
            </Button>
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
