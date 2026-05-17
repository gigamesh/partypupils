import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

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
    <div>
      <div className="mb-4">
        <Button href="/admin/orders" size="sm" variant="ghost">
          ← All orders
        </Button>
      </div>
      <h1>Demo: Orders</h1>
      <p className="text-muted-foreground mb-6">
        Preview what each completed order looks like from the customer&apos;s
        download page.
      </p>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">
          No completed orders found in the connected database.
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const shape = classify(order);
            return (
              <div
                key={order.id}
                className="glass-panel rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-sm">#{order.id}</span>
                  <span className="text-sm text-muted-foreground">
                    {order.createdAt.toLocaleDateString()}
                  </span>
                </div>
                <div className="truncate text-sm">{order.email}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="text-foreground">
                      {formatCurrency(order.amountTotal)}
                    </span>{" "}
                    total
                  </span>
                  <span>
                    <span className="text-foreground">{shape.scenarioLabel}</span>{" "}
                    scenario
                  </span>
                  <span>
                    <span className="text-foreground">{shape.totalTracks}</span>{" "}
                    tracks
                  </span>
                </div>
                <Button
                  href={`/admin/orders/demo/${order.id}`}
                  size="sm"
                  variant="secondary"
                  className="self-start"
                >
                  View
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
