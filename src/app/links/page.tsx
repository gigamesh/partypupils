import { SocialLinks } from "@/components/SocialLinks";
import { prisma } from "@/lib/db";
import { isInternalUrl } from "@/lib/urls";
import type { Metadata } from "next";
import Image from "@/components/Image";

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
          <a href="/" className="inline-block">
            <Image
              src="/images/pp-logo.svg"
              alt="Party Pupils"
              width={120}
              height={50}
              className="h-8 w-auto"
            />
          </a>
          <p className="text-white/60 text-sm mt-1">
            Yacht House, Funky House & Disco
            <br />
            Producer/DJ
          </p>
        </div>

        <SocialLinks iconSize={22} />

        <div className="w-full flex flex-col gap-3 mt-2">
          {links.map((link) => {
            const internal = isInternalUrl(link.url);
            return (
              <a
                key={link.id}
                href={link.url}
                {...(!internal && { target: "_blank", rel: "noopener noreferrer" })}
                className="block w-full text-center py-3.5 px-4 rounded-full
                  border border-white/20 bg-white/10 backdrop-blur-sm
                  text-white font-medium text-sm uppercase tracking-wide
                  hover:bg-neon/20 hover:border-neon/50
                  transition-all duration-200"
              >
                {link.title}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
