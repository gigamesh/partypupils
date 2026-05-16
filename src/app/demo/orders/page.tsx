import { Button } from "@/components/ui/button";
import { verifyAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Demo Orders",
};

export const dynamic = "force-dynamic";

interface OrderShape {
  releaseCount: number;
  trackCount: number;
  totalTracks: number;
  scenarioLabel: string;
}

function classify(order: {
  items: {
    releaseId: number | null;
    trackId: number | null;
    release: { tracks: unknown[] } | null;
  }[];
}): OrderShape {
  const releaseItems = order.items.filter((i) => i.releaseId !== null);
  const trackItems = order.items.filter((i) => i.trackId !== null);
  const tracksFromReleases = releaseItems.reduce(
    (sum, item) => sum + (item.release?.tracks.length ?? 0),
    0,
  );
  const totalTracks = tracksFromReleases + trackItems.length;

  let scenarioLabel: string;
  if (releaseItems.length >= 1 && trackItems.length >= 1) {
    scenarioLabel = "mixed";
  } else if (releaseItems.length >= 1) {
    const allMulti = releaseItems.every(
      (item) => (item.release?.tracks.length ?? 0) >= 2,
    );
    scenarioLabel = allMulti ? "release (multi-track)" : "release";
  } else if (trackItems.length >= 2) {
    scenarioLabel = "à la carte (multi-track)";
  } else if (trackItems.length === 1) {
    scenarioLabel = "single track";
  } else {
    scenarioLabel = "empty";
  }

  return {
    releaseCount: releaseItems.length,
    trackCount: trackItems.length,
    totalTracks,
    scenarioLabel,
  };
}

export default async function DemoOrdersListPage() {
  if (!(await verifyAdminSession())) notFound();

  const orders = await prisma.order.findMany({
    where: { status: "completed" },
    include: {
      items: {
        include: {
          release: { include: { tracks: { select: { id: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1>Demo: Orders</h1>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          No completed orders found in the connected database.
        </p>
      ) : (
        <div className="glass-panel rounded-lg p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Total</th>
                <th className="py-2 px-2">Scenario</th>
                <th className="py-2 px-2">Tracks</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const shape = classify(order);
                return (
                  <tr
                    key={order.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2 px-2 font-mono">{order.id}</td>
                    <td className="py-2 px-2">
                      {order.createdAt.toLocaleDateString()}
                    </td>
                    <td className="py-2 px-2 truncate max-w-[180px]">
                      {order.email}
                    </td>
                    <td className="py-2 px-2">
                      {formatCurrency(order.amountTotal)}
                    </td>
                    <td className="py-2 px-2">{shape.scenarioLabel}</td>
                    <td className="py-2 px-2">{shape.totalTracks}</td>
                    <td className="py-2 px-2">
                      <Button
                        href={`/demo/orders/${order.id}`}
                        size="sm"
                        variant="secondary"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
