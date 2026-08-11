import Image from "@/components/Image";

interface BundleCoverStackProps {
  coverImageUrls: string[];
  className?: string;
}

/**
 * Bundle artwork derived from its member releases' covers — a 2x2 grid of up
 * to four, or a single tile when only one cover is available. Bundles have no
 * uploaded art of their own.
 */
export function BundleCoverStack({ coverImageUrls, className }: BundleCoverStackProps) {
  const covers = coverImageUrls.slice(0, 4);
  const single = covers.length <= 1;
  const tiles = single ? 1 : covers.length <= 2 ? 2 : 4;

  return (
    <div
      className={`grid shrink-0 overflow-hidden rounded bg-muted ${
        single ? "grid-cols-1" : "grid-cols-2"
      } ${className ?? "h-16 w-16"}`}
    >
      {Array.from({ length: tiles }, (_, i) => {
        const url = covers[i];
        return (
          <div key={i} className="relative h-full w-full bg-muted">
            {url ? (
              <Image src={url} alt="" fill className="object-cover" sizes="80px" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                ♪
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
