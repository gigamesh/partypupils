import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
import { NewLinkPageForm } from "./NewLinkPageForm";

interface Props {
  searchParams: Promise<{ releaseId?: string }>;
}

export default async function NewLinkPagePage({ searchParams }: Props) {
  const { releaseId } = await searchParams;
  const releaseRows = await db.query.releases.findMany({
    orderBy: desc(releases.createdAt),
    columns: {
      id: true,
      name: true,
      slug: true,
      coverImageUrl: true,
      isPublished: true,
    },
  });

  const initialRelease = releaseId
    ? releaseRows.find((r) => r.id === Number(releaseId))
    : undefined;

  return (
    <div className="max-w-2xl">
      <h1>New Link Page</h1>
      <NewLinkPageForm releases={releaseRows} initialRelease={initialRelease} />
    </div>
  );
}
