"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  releaseId: number;
  initial: boolean;
  /** Server-computed: release is on but at least one of its tracks is off. */
  initialPartial?: boolean;
}

export function ReleaseRadioToggle({ releaseId, initial, initialPartial = false }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [partial, setPartial] = useState(initialPartial && initial);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && checked;
  }, [partial, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Include release in Party Pupils Radio"
      title={partial && checked ? "Some tracks in this release are excluded" : undefined}
      onChange={async (e) => {
        const next = e.target.checked;
        setChecked(next);
        if (!next) setPartial(false);
        try {
          const r = await fetch(`/api/admin/releases/${releaseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inRadio: next }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          startTransition(() => router.refresh());
        } catch {
          setChecked(!next);
          setPartial(initialPartial && !next ? false : initialPartial);
        }
      }}
      className="h-4 w-4 cursor-pointer"
    />
  );
}
