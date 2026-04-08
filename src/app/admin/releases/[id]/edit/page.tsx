import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReleaseForm } from "../../ReleaseForm";
import { DeleteReleaseButton } from "../../DeleteReleaseButton";

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
    <div className="max-w-2xl">
      <a href={`/music/${release.slug}`} className="neon-link text-sm">View public page →</a>
      <div className="flex items-baseline gap-6 mb-6">
        <h1>{release.name}</h1>
        <div className="ml-auto">
          <DeleteReleaseButton releaseId={release.id} releaseName={release.name} redirectOnDelete />
        </div>
      </div>
      <ReleaseForm release={release} />
    </div>
  );
}
