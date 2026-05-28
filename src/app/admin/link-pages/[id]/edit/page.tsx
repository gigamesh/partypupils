import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { linkPages, releases } from "@/db/schema";
import { getBaseUrl } from "@/lib/utils";
import { LinkPageForm } from "../../LinkPageForm";
import { DeleteLinkPageButton } from "../../DeleteLinkPageButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLinkPagePage({ params }: Props) {
  const { id } = await params;
  const [page, releaseRows] = await Promise.all([
    db.query.linkPages.findFirst({
      where: eq(linkPages.id, Number(id)),
      with: {
        items: { orderBy: (i, { asc }) => asc(i.position) },
        release: { columns: { id: true, name: true, slug: true, coverImageUrl: true, isPublished: true } },
      },
    }),
    db.query.releases.findMany({
      orderBy: desc(releases.createdAt),
      columns: { id: true, name: true, slug: true, coverImageUrl: true, isPublished: true },
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
      <LinkPageForm page={page} releases={releaseRows} baseUrl={getBaseUrl()} />
    </div>
  );
}
