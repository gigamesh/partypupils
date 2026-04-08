import { prisma } from "@/lib/db";
import { SocialLinks } from "@/components/SocialLinks";
import type { Metadata } from "next";
import Image from "next/image";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Links",
  description: "Yacht House, Funky House & Disco Producer/DJ",
};

export default async function LinksPage() {
  const links = await prisma.link.findMany({
    where: { isVisible: true },
    orderBy: { position: "asc" },
  });

  return (
    <div className="min-h-dvh flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-5">
        <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden ring-2 ring-white/20">
          <Image
            src="/images/promo-palm-trees.jpg"
            alt="Party Pupils"
            width={400}
            height={400}
            className="w-full h-full object-cover"
            priority
          />
        </div>

        <div className="text-center">
          <p className="text-white font-semibold text-lg">@partypupils</p>
          <p className="text-white/60 text-sm mt-1">
            Yacht House, Funky House & Disco
            <br />
            Producer/DJ
          </p>
        </div>

        <SocialLinks iconSize={22} />

        <div className="w-full flex flex-col gap-3 mt-2">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3.5 px-4 rounded-full
                border border-white/20 bg-white/10 backdrop-blur-sm
                text-white font-medium text-sm uppercase tracking-wide
                hover:bg-neon/20 hover:border-neon/50
                transition-all duration-200"
            >
              {link.title}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
