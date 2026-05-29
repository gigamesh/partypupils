import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { orders as ordersTable } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo Orders",
};

export const dynamic = "force-dynamic";

function countTracks(order: {
  items: {
    trackId: number | null;
    release: { tracks: unknown[] } | null;
  }[];
}): number {
  return order.items.reduce(
    (sum, item) =>
      sum + (item.release?.tracks.length ?? 0) + (item.trackId ? 1 : 0),
    0,
  );
}

export default async function DemoOrdersListPage() {
  const orders = await db.query.orders.findMany({
    where: eq(ordersTable.status, "completed"),
    with: {
      items: {
        with: {
          release: { with: { tracks: { columns: { id: true } } } },
        },
      },
    },
    orderBy: desc(ordersTable.createdAt),
    limit: 50,
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
            const totalTracks = countTracks(order);
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
                    <span className="text-foreground">{totalTracks}</span>{" "}
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
