"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  releaseId: number;
  initial: boolean;
}

export function ReleaseRadioToggle({ releaseId, initial }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      aria-label="Include release in Party Pupils Radio"
      onChange={async (e) => {
        const next = e.target.checked;
        setChecked(next);
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
        }
      }}
      className="h-4 w-4 cursor-pointer"
    />
  );
}
