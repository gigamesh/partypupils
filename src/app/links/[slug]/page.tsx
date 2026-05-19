import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkPageLayout } from "@/components/LinkPageLayout";
import { getPublicLinkPageBySlug } from "@/lib/link-pages";

interface Props {
  params: Promise<{ slug: string }>;
}

function resolveCoverImage(page: NonNullable<Awaited<ReturnType<typeof getPublicLinkPageBySlug>>>) {
  // Refuse to leak a draft release's cover image when the link page has no override.
  const releaseCover = page.release?.isPublished ? page.release.coverImageUrl : null;
  return page.coverImageUrl ?? releaseCover ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicLinkPageBySlug(slug);
  if (!page) return { title: "Not Found" };
  const cover = resolveCoverImage(page);
  return {
    title: page.title,
    description: page.description ?? undefined,
    openGraph: cover
      ? { images: [{ url: cover, alt: page.title }] }
      : undefined,
  };
}

export default async function CustomLinkPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPublicLinkPageBySlug(slug);
  if (!page) notFound();

  const cover = resolveCoverImage(page);

  return (
    <LinkPageLayout
      cover={cover ? { src: cover, alt: page.title } : null}
      header={
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
          {page.description && (
            <p className="text-white/60 text-sm mt-1 whitespace-pre-line">
              {page.description}
            </p>
          )}
        </>
      }
      items={page.items}
    />
  );
}
