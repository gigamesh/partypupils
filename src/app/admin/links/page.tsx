export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { links as linksTable } from "@/db/schema";
import { LinksForm } from "./LinksForm";

export default async function AdminLinksPage() {
  const links = await db.query.links.findMany({
    orderBy: asc(linksTable.position),
  });

  return (
    <div>
      <h1>Links</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-2xl">
        Edits the single global links page at <code>/links</code> and the hero links on the homepage.
        For a per-release page with Spotify/Apple/YouTube buttons, use <a href="/admin/link-pages" className="neon-link">Link Pages</a> instead.
      </p>
      <LinksForm initialLinks={links} />
    </div>
  );
}
