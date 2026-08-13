"use client";

import { useState } from "react";
import Image from "@/components/Image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BundlesConfigSchema,
  bundleMemberIds,
  memberNoun,
  withKind,
  withMemberIds,
  type Bundle,
  type BundleKind,
} from "@/lib/bundle-schema";
import type { BundlePickerItem } from "@/lib/bundles";
import { applyBundleDiscount } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

interface BundlesEditorProps {
  initialBundles: Bundle[];
  releases: BundlePickerItem[];
  tracks: BundlePickerItem[];
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/** The fields every bundle has, whichever kind it is. */
type BundleCommon = Pick<Bundle, "name" | "description" | "discountPercent" | "published">;

const KIND_LABELS: Record<BundleKind, string> = {
  releases: "Releases",
  tracks: "Songs",
};

/** Generates a stable id for newly-added bundles. Stays fixed across renames so carts survive edits. */
function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BundlesEditor({ initialBundles, releases, tracks }: BundlesEditorProps) {
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const optionsByKind: Record<BundleKind, BundlePickerItem[]> = {
    releases,
    tracks,
  };
  const itemById: Record<BundleKind, Map<number, BundlePickerItem>> = {
    releases: new Map(releases.map((r) => [r.id, r])),
    tracks: new Map(tracks.map((t) => [t.id, t])),
  };

  const validation = BundlesConfigSchema.safeParse({ bundles });
  const fieldErrors = new Map<string, string>();
  let formError: string | undefined;
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      // path looks like ["bundles", index, "name" | "releaseIds" | "trackIds" | ...]
      if (issue.path[0] === "bundles" && typeof issue.path[1] === "number") {
        const key = `${issue.path[1]}:${String(issue.path[2] ?? "")}`;
        if (!fieldErrors.has(key)) fieldErrors.set(key, issue.message);
      } else if (formError === undefined) {
        formError = issue.message;
      }
    }
  }

  /** Replace one bundle, and clear any "Saved" badge left over from the last write. */
  function replace(index: number, next: (bundle: Bundle) => Bundle) {
    setBundles((prev) => prev.map((b, i) => (i === index ? next(b) : b)));
    setStatus({ kind: "idle" });
  }

  function update(index: number, patch: Partial<BundleCommon>) {
    replace(index, (b) => ({ ...b, ...patch }));
  }

  function toggleMember(index: number, memberId: number) {
    replace(index, (b) => {
      const ids = bundleMemberIds(b);
      return withMemberIds(
        b,
        ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId],
      );
    });
  }

  function moveMember(index: number, memberIndex: number, direction: "up" | "down") {
    const swap = direction === "up" ? memberIndex - 1 : memberIndex + 1;
    replace(index, (b) => {
      const ids = bundleMemberIds(b);
      if (swap < 0 || swap >= ids.length) return b;
      const next = [...ids];
      [next[memberIndex], next[swap]] = [next[swap]!, next[memberIndex]!];
      return withMemberIds(b, next);
    });
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

  function setKind(index: number, kind: BundleKind) {
    const bundle = bundles[index]!;
    if (bundle.kind === kind) return;
    // Release ids and track ids aren't interchangeable, so the selection can't
    // carry over — say so before throwing the admin's picks away.
    if (
      bundleMemberIds(bundle).length > 0 &&
      !confirm(
        `Switch "${bundle.name || "this bundle"}" to ${KIND_LABELS[kind].toLowerCase()}? Its current selection will be cleared.`,
      )
    ) {
      return;
    }
    replace(index, (b) => withKind(b, kind));
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
      {
        id: newId(),
        name: "",
        kind: "releases",
        releaseIds: [],
        discountPercent: 15,
        published: false,
      },
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
          const memberIds = bundleMemberIds(bundle);
          const options = optionsByKind[bundle.kind];
          const lookup = itemById[bundle.kind];
          const members = memberIds
            .map((id) => lookup.get(id))
            .filter((m): m is BundlePickerItem => m !== undefined);
          const originalPrice = members.reduce((sum, m) => sum + m.price, 0);
          const discountedPrice = applyBundleDiscount(originalPrice, bundle.discountPercent);
          const membersError =
            fieldErrors.get(`${index}:releaseIds`) ?? fieldErrors.get(`${index}:trackIds`);

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
                    <div
                      className="flex items-center gap-1 text-sm"
                      role="group"
                      aria-label="Bundle contents"
                    >
                      Contains
                      {(["releases", "tracks"] as const).map((kind) => (
                        <Button
                          key={kind}
                          variant={bundle.kind === kind ? "default" : "outline"}
                          size="sm"
                          aria-pressed={bundle.kind === kind}
                          onClick={() => setKind(index, kind)}
                        >
                          {KIND_LABELS[kind]}
                        </Button>
                      ))}
                    </div>
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
                    {bundle.kind === "tracks" ? "Songs" : "Releases"} in this bundle
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded border border-border p-2 space-y-1">
                    {options.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No published {bundle.kind === "tracks" ? "songs" : "releases"} to
                        choose from.
                      </p>
                    )}
                    {options.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={memberIds.includes(option.id)}
                          onChange={() => toggleMember(index, option.id)}
                          className="h-4 w-4 accent-neon"
                        />
                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                          {option.coverImageUrl ? (
                            <Image
                              src={option.coverImageUrl}
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
                        <span className="min-w-0 flex-1 truncate">
                          {option.releaseName && (
                            <span className="text-muted-foreground">
                              {option.releaseName} —{" "}
                            </span>
                          )}
                          {option.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatCurrency(option.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                  {membersError && <p className="text-xs text-destructive">{membersError}</p>}
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
                      {memberNoun(bundle.kind, members.length)}
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
