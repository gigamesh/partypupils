import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import { Badge } from "@/components/ui/badge";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { title: "Not Found" };
  return {
    title: `${product.name} | Party Pupils`,
    description: product.description || `Buy ${product.name} by Party Pupils.`,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug, isPublished: true },
    include: { files: true },
  });

  if (!product) notFound();

  const formats = [...new Set(product.files.map((f) => f.format.toUpperCase()))];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {product.coverImageUrl ? (
            <Image
              src={product.coverImageUrl}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-muted-foreground">
              ♪
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <Badge variant="secondary" className="mb-2">
              {product.type}
            </Badge>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-1 text-2xl font-semibold">
              {formatCurrency(product.price)}
            </p>
          </div>

          {product.description && (
            <p className="text-muted-foreground">{product.description}</p>
          )}

          {formats.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Includes: {formats.join(", ")}
            </div>
          )}

          <AddToCartButton
            product={{
              productId: product.id,
              name: product.name,
              slug: product.slug,
              price: product.price,
              coverImageUrl: product.coverImageUrl,
            }}
          />
        </div>
      </div>
    </div>
  );
}
