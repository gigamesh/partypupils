export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases as releasesTable } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
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
import { DeleteReleaseButton } from "./releases/DeleteReleaseButton";
import { ReleaseRadioToggle } from "./releases/ReleaseRadioToggle";

export default async function AdminReleasesPage() {
  // Pull releases + their tracks' `inRadio` flag in one round-trip. Prisma
  // used `include._count.tracks` + a partial-select `tracks.inRadio`; the
  // Drizzle relational API can fetch the tracks slice and we derive the
  // count from `tracks.length` to avoid a second `count()` query per row.
  const releaseRows = await db.query.releases.findMany({
    orderBy: desc(releasesTable.createdAt),
    with: {
      tracks: { columns: { inRadio: true } },
    },
  });
  // Mirror Prisma's `_count.tracks` shape so the JSX below can keep reading
  // `release._count.tracks`.
  const releases = releaseRows.map((release) => ({
    ...release,
    _count: { tracks: release.tracks.length },
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Releases</h1>
        <Button href="/admin/releases/new">New Release</Button>
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
