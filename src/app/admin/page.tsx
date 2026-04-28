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
import { DeleteReleaseButton } from "./releases/DeleteReleaseButton";
import { ReleaseRadioToggle } from "./releases/ReleaseRadioToggle";

export default async function AdminReleasesPage() {
  const releases = await prisma.release.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tracks: true } },
      tracks: { select: { inRadio: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Releases</h1>
        <Link href="/admin/releases/new" className={cn(buttonVariants())}>
          New Release
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right" />
            <TableHead className="text-right">Type</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Tracks</TableHead>
            <TableHead className="text-center" title="Include in Party Pupils Radio">In Radio</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {releases.map((release) => (
            <TableRow key={release.id}>
              <TableCell className="font-medium">
                <Link href={`/admin/releases/${release.id}/edit`} className="hover:underline">
                  {release.name}
                </Link>
              </TableCell>
              <TableCell className="text-right">
                <DeleteReleaseButton releaseId={release.id} releaseName={release.name} />
              </TableCell>
              <TableCell className="text-right">{release.type}</TableCell>
              <TableCell className="text-right">{formatCurrency(release.price)}</TableCell>
              <TableCell className="text-right">{release._count.tracks}</TableCell>
              <TableCell className="text-center">
                <ReleaseRadioToggle
                  releaseId={release.id}
                  initial={release.inRadio}
                  initialPartial={release.inRadio && release.tracks.some((t) => !t.inRadio)}
                />
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={release.isPublished ? "default" : "secondary"}>
                  {release.isPublished ? "Published" : "Draft"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {releases.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No releases yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
