import Image from "@/components/Image";
import { LinkPageLayout } from "@/components/LinkPageLayout";
import { getVisibleLinks } from "@/lib/release-reads";
import type { Metadata } from "next";
import Link from "next/link";

// ISR: serve cached HTML from the CDN and revalidate hourly. Admin link edits
// call revalidateTag(LINKS_TAG), which refreshes both the cached read and this
// route immediately. Rendering per-request (force-dynamic) re-queried Postgres
// on every visit, which kept Neon's compute awake around the clock.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Links",
  description: "Yacht House, Funky House & Disco Producer/DJ",
};

export default async function LinksPage() {
  const links = await getVisibleLinks();

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
