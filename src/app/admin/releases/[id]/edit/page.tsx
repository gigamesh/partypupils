import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReleaseForm } from "../../ReleaseForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditReleasePage({ params }: Props) {
  const { id } = await params;
  const release = await prisma.release.findUnique({
    where: { id: parseInt(id) },
    include: {
      tracks: {
        orderBy: { trackNumber: "asc" },
        include: { files: true },
      },
    },
  });

  if (!release) notFound();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1>Edit: {release.name}</h1>
        <a href={`/music/${release.slug}`} className="neon-link text-sm">View public page →</a>
      </div>
      <ReleaseForm release={release} />
    </div>
  );
}
