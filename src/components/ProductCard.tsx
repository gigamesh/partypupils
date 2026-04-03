import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ProductCardProps {
  name: string;
  slug: string;
  price: number;
  type: string;
  coverImageUrl: string | null;
}

export function ProductCard({ name, slug, price, type, coverImageUrl }: ProductCardProps) {
  return (
    <Link
      href={`/store/${slug}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-muted-foreground/30"
    >
      <div className="relative aspect-square bg-muted">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-muted-foreground">
            ♪
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-tight">{name}</h3>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {type}
          </Badge>
        </div>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {formatCurrency(price)}
        </p>
      </div>
    </Link>
  );
}
