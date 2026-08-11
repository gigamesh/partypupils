"use client";

import { useState } from "react";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BundlesConfigSchema, type Bundle } from "@/lib/bundle-schema";
import type { BundleMember } from "@/lib/bundles";
import { applyBundleDiscount } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

interface BundlesEditorProps {
  initialBundles: Bundle[];
  releases: BundleMember[];
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/** Generates a stable id for newly-added bundles. Stays fixed across renames so carts survive edits. */
function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BundlesEditor({ initialBundles, releases }: BundlesEditorProps) {
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const releaseById = new Map(releases.map((r) => [r.id, r]));

  const validation = BundlesConfigSchema.safeParse({ bundles });
  const fieldErrors = new Map<string, string>();
  let formError: string | undefined;
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      // path looks like ["bundles", index, "name" | "releaseIds" | ...]
      if (issue.path[0] === "bundles" && typeof issue.path[1] === "number") {
        const key = `${issue.path[1]}:${String(issue.path[2] ?? "")}`;
        if (!fieldErrors.has(key)) fieldErrors.set(key, issue.message);
      } else if (formError === undefined) {
        formError = issue.message;
      }
    }
  }

  function update(index: number, patch: Partial<Bundle>) {
    setBundles((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setStatus({ kind: "idle" });
  }

  function toggleRelease(index: number, releaseId: number) {
    setBundles((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        const has = b.releaseIds.includes(releaseId);
        return {
          ...b,
          releaseIds: has
            ? b.releaseIds.filter((id) => id !== releaseId)
            : [...b.releaseIds, releaseId],
        };
      }),
    );
    setStatus({ kind: "idle" });
  }

  function moveMember(index: number, memberIndex: number, direction: "up" | "down") {
    const swap = direction === "up" ? memberIndex - 1 : memberIndex + 1;
    setBundles((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b;
        if (swap < 0 || swap >= b.releaseIds.length) return b;
        const next = [...b.releaseIds];
        [next[memberIndex], next[swap]] = [next[swap]!, next[memberIndex]!];
        return { ...b, releaseIds: next };
      }),
    );
    setStatus({ kind: "idle" });
  }

  function moveBundle(index: number, direction: "up" | "down") {
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= bundles.length) return;
    setBundles((prev) => {
      const next = [...prev];
      [next[index], next[swap]] = [next[swap]!, next[index]!];
      return next;
    });
    setStatus({ kind: "idle" });
  }

  function removeBundle(index: number) {
    const bundle = bundles[index]!;
    if (!confirm(`Delete "${bundle.name || "this bundle"}"? Customers with it in their cart will be asked to remove it.`)) {
      return;
    }
    setBundles((prev) => prev.filter((_, i) => i !== index));
    setStatus({ kind: "idle" });
  }

  function addBundle() {
    setBundles((prev) => [
      ...prev,
      { id: newId(), name: "", releaseIds: [], discountPercent: 15, published: false },
    ]);
    setStatus({ kind: "idle" });
  }

  async function handleSave() {
    if (!validation.success) {
      setStatus({ kind: "error", message: "Fix the highlighted errors before saving." });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/bundles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({ kind: "error", message: body.error ?? `Save failed (${res.status})` });
        return;
      }
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s)), 3000);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {bundles.map((bundle, index) => {
          const members = bundle.releaseIds
            .map((id) => releaseById.get(id))
            .filter((r): r is BundleMember => r !== undefined);
          const originalPrice = members.reduce((sum, m) => sum + m.price, 0);
          const discountedPrice = applyBundleDiscount(originalPrice, bundle.discountPercent);

          return (
            <div key={bundle.id} className="glass-panel rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveBundle(index, "up")}
                    aria-label="Move bundle up"
                  >
                    ▲
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === bundles.length - 1}
                    onClick={() => moveBundle(index, "down")}
                    aria-label="Move bundle down"
                  >
                    ▼
                  </Button>
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <Input
                      value={bundle.name}
                      onChange={(e) => update(index, { name: e.target.value })}
                      placeholder="Bundle name — e.g. The Remix EPs"
                      aria-invalid={Boolean(fieldErrors.get(`${index}:name`))}
                    />
                    {fieldErrors.get(`${index}:name`) && (
                      <p className="mt-1 text-xs text-destructive">
                        {fieldErrors.get(`${index}:name`)}
                      </p>
                    )}
                  </div>

                  <Textarea
                    value={bundle.description ?? ""}
                    onChange={(e) =>
                      update(index, { description: e.target.value || undefined })
                    }
                    placeholder="Optional description shown on the bundle card"
                    rows={2}
                    maxLength={500}
                  />

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      Discount
                      <Input
                        type="number"
                        min="0"
                        max="95"
                        value={bundle.discountPercent}
                        onChange={(e) =>
                          update(index, { discountPercent: Number(e.target.value) })
                        }
                        className="w-20"
                        aria-invalid={Boolean(fieldErrors.get(`${index}:discountPercent`))}
                      />
                      %
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={bundle.published}
                        onChange={(e) => update(index, { published: e.target.checked })}
                        className="h-4 w-4 accent-neon"
                      />
                      Published
                    </label>
                  </div>
                  {fieldErrors.get(`${index}:discountPercent`) && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.get(`${index}:discountPercent`)}
                    </p>
                  )}
                </div>

                <Button variant="destructive" size="sm" onClick={() => removeBundle(index)}>
                  Delete
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Releases in this bundle
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded border border-border p-2 space-y-1">
                    {releases.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No published releases to choose from.
                      </p>
                    )}
                    {releases.map((release) => (
                      <label
                        key={release.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={bundle.releaseIds.includes(release.id)}
                          onChange={() => toggleRelease(index, release.id)}
                          className="h-4 w-4 accent-neon"
                        />
                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                          {release.coverImageUrl ? (
                            <Image
                              src={release.coverImageUrl}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="32px"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-muted-foreground">
                              ♪
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{release.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatCurrency(release.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.get(`${index}:releaseIds`) && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.get(`${index}:releaseIds`)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Order on the bundle card
                  </p>
                  {members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing selected yet.</p>
                  ) : (
                    <ol className="space-y-1">
                      {members.map((member, memberIndex) => (
                        <li
                          key={member.id}
                          className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{member.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={memberIndex === 0}
                            onClick={() => moveMember(index, memberIndex, "up")}
                            aria-label={`Move ${member.name} up`}
                          >
                            ▲
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={memberIndex === members.length - 1}
                            onClick={() => moveMember(index, memberIndex, "down")}
                            aria-label={`Move ${member.name} down`}
                          >
                            ▼
                          </Button>
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="rounded border border-border p-2">
                    <p className="text-xs text-muted-foreground">
                      {members.length} release{members.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-lg font-bold text-neon">
                        {formatCurrency(discountedPrice)}
                      </span>
                      {bundle.discountPercent > 0 && originalPrice > discountedPrice && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatCurrency(originalPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {bundles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No bundles yet. The complete-catalog bundle is always shown on /music; add
            one here to sell a smaller pack alongside it.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={addBundle}>
          Add bundle
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {formError && <span className="text-sm text-destructive">{formError}</span>}
          {status.kind === "saved" && <span className="text-sm text-neon">Saved</span>}
          {status.kind === "error" && (
            <span className="text-sm text-destructive">{status.message}</span>
          )}
          <Button
            onClick={handleSave}
            disabled={status.kind === "saving" || !validation.success}
          >
            {status.kind === "saving" ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
