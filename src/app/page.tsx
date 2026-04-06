import { HashScroll } from "@/components/HashScroll";
import { ReleaseCard } from "@/components/ReleaseCard";
import { ScrollOverlay } from "@/components/ScrollOverlay";
import { SeatedTourWidget } from "@/components/SeatedTourWidget";
import { SocialLinks } from "@/components/SocialLinks";
import { prisma } from "@/lib/db";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredReleases = await prisma.release.findMany({
    where: { isPublished: true },
    orderBy: { releasedAt: "desc" },
    take: 4,
  });

  return (
    <div className="bg-darkened-off">
      <HashScroll />
      <ScrollOverlay />
      <section className="relative min-h-[85vh] flex items-center justify-center px-4 py-24">
        <div className="relative w-full max-w-5xl min-h-[75vh] flex items-center justify-center border border-white/50 overflow-hidden">
          <div className="relative z-10 flex w-full max-w-5xl items-center justify-center">
            <div className="flex-1 flex justify-center md:-translate-x-[15%]">
              <Image
                src="/images/pp-logo.svg"
                alt="Party Pupils"
                width={500}
                height={210}
                className="w-full max-w-[280px] md:max-w-[420px] h-auto"
                priority
                unoptimized
              />
            </div>
          </div>

          <div className="hidden md:block absolute right-0 bottom-0 z-10">
            <Image
              src="/images/side-profile.png"
              alt="Party Pupils"
              width={600}
              height={720}
              className="h-[65vh] w-auto object-contain"
              priority
              unoptimized
            />
          </div>

          <div className="absolute bottom-6 left-6 z-10">
            <SocialLinks />
          </div>
        </div>
      </section>

      {featuredReleases.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <h2 className="neon-glow text-center uppercase">Latest Releases</h2>
          <div className="mb-6 text-center">
            <Link
              href="/music"
              className="neon-link text-sm uppercase tracking-wider"
            >
              View All Music →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredReleases.map((release) => (
              <ReleaseCard
                key={release.id}
                name={release.name}
                slug={release.slug}
                price={release.price}
                type={release.type}
                coverImageUrl={release.coverImageUrl}
                showPrice={false}
              />
            ))}
          </div>
        </section>
      )}

      <section
        id="tour"
        className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20"
      >
        <h2 className="neon-glow text-center uppercase">Tour Dates</h2>
        <SeatedTourWidget />
      </section>
    </div>
  );
}
