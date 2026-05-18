import { prisma } from "@/lib/db";
import { NewLinkPageForm } from "./NewLinkPageForm";

interface Props {
  searchParams: Promise<{ releaseId?: string }>;
}

export default async function NewLinkPagePage({ searchParams }: Props) {
  const { releaseId } = await searchParams;
  const releases = await prisma.release.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true },
  });

  const initialRelease = releaseId
    ? releases.find((r) => r.id === Number(releaseId))
    : undefined;

  return (
    <div className="max-w-2xl">
      <h1>New Link Page</h1>
      <NewLinkPageForm releases={releases} initialRelease={initialRelease} />
    </div>
  );
}
