"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/RichTextEditor";
import { FAQ_SETTING_KEY } from "@/lib/faq-defaults";
import { FaqContentSchema, type FaqItem } from "@/lib/faq-schema";

interface FaqEditorProps {
  initialItems: FaqItem[];
  defaultItems: FaqItem[];
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/** Generates a stable id for newly-added FAQ items. */
function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FaqEditor({ initialItems, defaultItems }: FaqEditorProps) {
  const [items, setItems] = useState<FaqItem[]>(initialItems);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const validation = FaqContentSchema.safeParse({ items });
  const fieldErrors = new Map<string, string>();
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      // path looks like ["items", index, "question" | "answer" | "id"]
      if (issue.path[0] === "items" && typeof issue.path[1] === "number") {
        const key = `${issue.path[1]}:${String(issue.path[2] ?? "")}`;
        if (!fieldErrors.has(key)) fieldErrors.set(key, issue.message);
      }
    }
  }

  function updateItem(index: number, field: "question" | "answer", value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
    setStatus({ kind: "idle" });
  }

  function moveItem(index: number, direction: "up" | "down") {
    const swap = direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
    setStatus({ kind: "idle" });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setStatus({ kind: "idle" });
  }

  function addItem() {
    setItems((prev) => [...prev, { id: newId(), question: "", answer: "" }]);
    setStatus({ kind: "idle" });
  }

  function resetToDefaults() {
    if (!confirm("Replace the current FAQ with the built-in defaults? Unsaved edits will be lost.")) return;
    setItems(defaultItems.map((it) => ({ ...it })));
    setStatus({ kind: "idle" });
  }

  async function handleSave() {
    if (!validation.success) {
      setStatus({ kind: "error", message: "Fix the highlighted errors before saving." });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: FAQ_SETTING_KEY,
          value: JSON.stringify(validation.data),
        }),
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
        {items.map((item, index) => {
          const questionError = fieldErrors.get(`${index}:question`);
          const answerError = fieldErrors.get(`${index}:answer`);
          return (
            <div key={item.id} className="glass-panel rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveItem(index, "up")}
                    aria-label="Move up"
                  >
                    ▲
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, "down")}
                    aria-label="Move down"
                  >
                    ▼
                  </Button>
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <Input
                      value={item.question}
                      onChange={(e) => updateItem(index, "question", e.target.value)}
                      placeholder="Question"
                      aria-invalid={Boolean(questionError)}
                    />
                    {questionError && (
                      <p className="mt-1 text-xs text-destructive">{questionError}</p>
                    )}
                  </div>
                  <div>
                    <RichTextEditor
                      value={item.answer}
                      onChange={(html) => updateItem(index, "answer", html)}
                      ariaLabel="Answer"
                      ariaInvalid={Boolean(answerError)}
                    />
                    {answerError && (
                      <p className="mt-1 text-xs text-destructive">{answerError}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeItem(index)}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No FAQ items yet. Add one below or reset to defaults.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={addItem}>
          Add question
        </Button>
        <Button variant="ghost" onClick={resetToDefaults}>
          Reset to defaults
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {status.kind === "saved" && (
            <span className="text-sm text-neon">Saved</span>
          )}
          {status.kind === "error" && (
            <span className="text-sm text-destructive">{status.message}</span>
          )}
          <Button onClick={handleSave} disabled={status.kind === "saving" || !validation.success}>
            {status.kind === "saving" ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
