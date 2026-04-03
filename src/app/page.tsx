import Link from "next/link";
import { prisma } from "@/lib/db";
import { ProductCard } from "@/components/ProductCard";
import { SocialLinks } from "@/components/SocialLinks";
import { SeatedTourWidget } from "@/components/SeatedTourWidget";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MERCH_URL, STREAMING_LINKS } from "@/lib/constants";

export default async function HomePage() {
  const featuredProducts = await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { releasedAt: "desc" },
    take: 4,
  });

  return (
    <div>
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Party Pupils
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Producer. DJ. Download exclusive tracks and releases.
        </p>
        <SocialLinks className="mt-2" />
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/store" className={cn(buttonVariants({ size: "lg" }))}>
            Browse Music
          </Link>
          <a
            href={MERCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
          >
            Merch
          </a>
        </div>
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          {STREAMING_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.name}
            </a>
          ))}
        </div>
      </section>

      {featuredProducts.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <h2 className="text-2xl font-bold mb-6">Latest Releases</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
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
        </section>
      )}

      <section id="tour" className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-2xl font-bold mb-6">Tour Dates</h2>
        <SeatedTourWidget />
      </section>
    </div>
  );
}
