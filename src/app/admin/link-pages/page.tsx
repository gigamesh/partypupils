export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteLinkPageButton } from "./DeleteLinkPageButton";

export default async function AdminLinkPagesPage() {
  const pages = await prisma.linkPage.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      release: { select: { id: true, name: true, slug: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1>Link Pages</h1>
        <Button href="/admin/link-pages/new">New Page</Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Standalone shareable pages — one URL per release (or campaign) with streaming-service buttons (Spotify, Apple Music, YouTube, etc.).
        Icons auto-detect from each URL. For the single global links page at <code>/links</code>, use <a href="/admin/links" className="neon-link">Links</a>.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="text-right" />
            <TableHead>Public URL</TableHead>
            <TableHead>Release</TableHead>
            <TableHead className="text-right">Links</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((page) => (
            <TableRow key={page.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/admin/link-pages/${page.id}/edit`}
                  className="hover:underline"
                >
                  {page.title}
                </Link>
              </TableCell>
              <TableCell className="text-right">
                <DeleteLinkPageButton pageId={page.id} pageTitle={page.title} />
              </TableCell>
              <TableCell>
                <a
                  href={`/links/${page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neon-link text-sm"
                >
                  /links/{page.slug}
                </a>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {page.release?.name ?? "—"}
              </TableCell>
              <TableCell className="text-right">{page._count.items}</TableCell>
              <TableCell className="text-right">
                <Badge variant={page.isPublished ? "default" : "secondary"}>
                  {page.isPublished ? "Published" : "Draft"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {pages.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground py-8"
              >
                No link pages yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
