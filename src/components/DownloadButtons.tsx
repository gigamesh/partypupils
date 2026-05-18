"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

interface DownloadFormat {
  format: string;
  /** Absent/empty → button renders disabled. */
  href?: string | null;
}

interface DownloadButtonsProps {
  formats: DownloadFormat[];
  className?: string;
}

export function DownloadButtons({ formats, className }: DownloadButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  function handleClick(format: string) {
    setLoading(format);
    setTimeout(() => setLoading(null), 3000);
  }

  return (
    <div className={cn("flex gap-2", className)}>
      {formats.map(({ format, href }) => {
        const label = loading === format ? (
          <><Loader2Icon className="h-4 w-4 animate-spin" /> Downloading</>
        ) : (
          format.toUpperCase()
        );
        if (!href) {
          return (
            <Button key={format} size="sm" variant="secondary" disabled>
              {format.toUpperCase()}
            </Button>
          );
        }
        return (
          <Button
            key={format}
            href={href}
            download
            prefetch={false}
            size="sm"
            variant="secondary"
            onClick={() => handleClick(format)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
