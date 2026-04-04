import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { AUDIO_FORMATS } from "@/lib/constants";

interface DownloadButtonsProps {
  token: string;
  productId: number;
}

export function DownloadButtons({ token, productId }: DownloadButtonsProps) {
  return (
    <div className="flex gap-2">
      {AUDIO_FORMATS.map((format) => (
        <a
          key={format}
          href={`/download/${token}?productId=${productId}&format=${format}`}
          className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
        >
          {format.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
