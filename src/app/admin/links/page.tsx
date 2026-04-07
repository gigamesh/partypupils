export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { LinksForm } from "./LinksForm";

export default async function AdminLinksPage() {
  const links = await prisma.link.findMany({
    orderBy: { position: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Links</h1>
      <LinksForm initialLinks={links} />
    </div>
  );
}
