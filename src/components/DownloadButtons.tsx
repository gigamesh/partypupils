import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface DownloadButtonsProps {
  token: string;
  trackId: number;
  availableFormats: string[];
}

export function DownloadButtons({ token, trackId, availableFormats }: DownloadButtonsProps) {
  return (
    <div className="flex gap-2">
      {availableFormats.map((format) => (
        <a
          key={format}
          href={`/download/${token}?trackId=${trackId}&format=${format}`}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          {format.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
