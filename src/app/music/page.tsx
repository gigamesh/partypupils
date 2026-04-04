import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/ProductCard";

export const metadata = {
  title: "Music | Party Pupils",
  description: "Browse and buy music from Party Pupils.",
};

export default async function StorePage() {
  const products = await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { releasedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="neon-glow text-3xl mb-8 uppercase">Music</h1>
      {products.length === 0 ? (
        <p className="text-muted-foreground">No music available yet. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              name={product.name}
              slug={product.slug}
              price={product.price}
              type={product.type}
              coverImageUrl={product.coverImageUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
