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
  });

  if (!release) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit: {release.name}</h1>
      <ReleaseForm release={release} />
    </div>
  );
}
