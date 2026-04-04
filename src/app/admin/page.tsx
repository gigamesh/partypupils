export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCurrency, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminReleasesPage() {
  const releases = await prisma.release.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tracks: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Releases</h1>
        <Link href="/admin/releases/new" className={cn(buttonVariants())}>
          New Release
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Tracks</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {releases.map((release) => (
            <TableRow key={release.id}>
              <TableCell className="font-medium">{release.name}</TableCell>
              <TableCell>{release.type}</TableCell>
              <TableCell>{formatCurrency(release.price)}</TableCell>
              <TableCell>{release._count.tracks}</TableCell>
              <TableCell>
                <Badge variant={release.isPublished ? "default" : "secondary"}>
                  {release.isPublished ? "Published" : "Draft"}
                </Badge>
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/releases/${release.id}/edit`}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {releases.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No releases yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
