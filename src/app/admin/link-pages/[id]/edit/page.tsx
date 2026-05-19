import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LinkPageForm } from "../../LinkPageForm";
import { DeleteLinkPageButton } from "../../DeleteLinkPageButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLinkPagePage({ params }: Props) {
  const { id } = await params;
  const [page, releases] = await Promise.all([
    prisma.linkPage.findUnique({
      where: { id: Number(id) },
      include: {
        items: { orderBy: { position: "asc" } },
        release: { select: { id: true, name: true, slug: true, coverImageUrl: true, isPublished: true } },
      },
    }),
    prisma.release.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, coverImageUrl: true, isPublished: true },
    }),
  ]);

  if (!page) notFound();

  return (
    <div className="max-w-2xl">
      <a
        href={`/links/${page.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="neon-link text-sm"
      >
        View public page →
      </a>
      <div className="flex items-baseline gap-6 mb-6">
        <h1>{page.title}</h1>
        <div className="ml-auto">
          <DeleteLinkPageButton
            pageId={page.id}
            pageTitle={page.title}
            redirectOnDelete
          />
        </div>
      </div>
      <LinkPageForm page={page} releases={releases} />
    </div>
  );
}
