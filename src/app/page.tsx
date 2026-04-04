import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/ProductCard";
import { SeatedTourWidget } from "@/components/SeatedTourWidget";
import { SocialLinks } from "@/components/SocialLinks";
import { prisma } from "@/lib/db";

export default async function HomePage() {
  const featuredProducts = await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { releasedAt: "desc" },
    take: 4,
  });

  return (
    <div>
      <section className="flex min-h-[85vh] flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <h1 className="flex flex-col items-center justify-center md:flex-row">
          <div className="neon-glow font-heading text-4xl sm:text-5xl uppercase italic order-2 mt-4 md:hidden">
            Party Pupils
          </div>
          <span className="neon-glow font-heading text-6xl uppercase italic hidden md:block md:w-[5em] md:text-right md:-mr-[1em] md:z-0 md:relative">
            Party
          </span>
          <Image
            src="/images/partyman.png"
            alt="Party Pupils Logo"
            width={400}
            height={480}
            className="w-full max-w-75 h-auto order-1 md:order-0 md:max-w-120 md:z-10"
            priority
          />
          <span className="neon-glow font-heading text-6xl uppercase italic hidden md:block md:w-[5em] md:text-left md:-ml-[1em] md:z-0 md:relative">
            Pupils
          </span>
        </h1>
        <SocialLinks className="neon-glow mt-2" />
      </section>

      {featuredProducts.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <h2 className="neon-glow text-center uppercase">Latest Releases</h2>
          <div className="mb-6 text-center">
            <Link
              href="/music"
              className="text-neon/70 hover:text-neon hover:drop-shadow-[0_0_6px_rgba(173,253,2,0.5)] transition-colors text-sm uppercase tracking-wider"
            >
              View All Music →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                name={product.name}
                slug={product.slug}
                price={product.price}
                type={product.type}
                coverImageUrl={product.coverImageUrl}
                showPrice={false}
              />
            ))}
          </div>
        </section>
      )}

      <section
        id="tour"
        className="mx-auto max-w-5xl px-4 py-16 bg-linear-to-b from-transparent via-black/85 to-transparent"
      >
        <h2 className="neon-glow text-center uppercase">Tour Dates</h2>
        <SeatedTourWidget />
      </section>
    </div>
  );
}
