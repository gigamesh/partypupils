import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReleaseForm } from "../../ReleaseForm";
import { DeleteReleaseButton } from "../../DeleteReleaseButton";
import { DownloadZipButtons } from "@/components/DownloadZipButtons";

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

  const linkPages = await prisma.linkPage.findMany({
    where: { releaseId: release.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, isPublished: true },
  });

  const availableFormats = [
    ...new Set(release.tracks.flatMap((t) => t.files.map((f) => f.format))),
  ].sort();

  return (
    <div className="max-w-2xl">
      <a href={`/music/${release.slug}`} className="neon-link text-sm">View public page →</a>
      <div className="flex items-baseline gap-6 mb-6">
        <h1>{release.name}</h1>
        <div className="ml-auto">
          <DeleteReleaseButton releaseId={release.id} releaseName={release.name} redirectOnDelete />
        </div>
      </div>
      {availableFormats.length > 0 && (
        <div className="glass-panel rounded-lg border p-4 mb-6 space-y-2">
          <span className="block text-xs uppercase tracking-wide text-muted-foreground">
            Download release ZIP
          </span>
          <p className="text-xs text-muted-foreground">
            Downloads this release exactly as a customer would receive it.
          </p>
          <DownloadZipButtons
            manifestEndpoint={`/api/admin/download/zip?releaseId=${release.id}`}
            availableFormats={availableFormats}
          />
        </div>
      )}
      <ReleaseForm release={release} linkPages={linkPages} />
    </div>
  );
}
