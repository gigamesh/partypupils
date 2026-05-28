import Image from "@/components/Image";
import { LinkPageLayout } from "@/components/LinkPageLayout";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";

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
    <LinkPageLayout
      cover={{ src: "/images/promo-palm-trees.jpg", alt: "Party Pupils" }}
      header={
        <>
          <Link href="/" className="inline-block">
            <Image
              src="/images/pp-logo.svg"
              alt="Party Pupils"
              width={120}
              height={50}
              className="h-8 w-auto"
            />
          </Link>
          <p className="text-white/60 text-sm mt-1">
            Yacht House, Funky House & Disco
            <br />
            Producer/DJ
          </p>
        </>
      }
      items={links}
    />
  );
}
