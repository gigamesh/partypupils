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

const PAGE_SIZE = 25;

const PERIODS: { label: string; value: string; days: number | null }[] = [
  { label: "Today", value: "today", days: 1 },
  { label: "7 days", value: "7d", days: 7 },
  { label: "30 days", value: "30d", days: 30 },
  { label: "90 days", value: "90d", days: 90 },
  { label: "All time", value: "all", days: null },
];

function getDateFilter(period: string): Date | null {
  const match = PERIODS.find((p) => p.value === period);
  if (!match?.days) return null;
  const d = new Date();
  d.setDate(d.getDate() - match.days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; period?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const period = params.period ?? "all";
  const query = params.q?.trim() ?? "";

  const dateFrom = getDateFilter(period);

  const where = {
    ...(dateFrom && { createdAt: { gte: dateFrom } }),
    ...(query && { email: { contains: query, mode: "insensitive" as const } }),
  };

  const [orders, totalCount, totals] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        items: {
          include: {
            release: { select: { name: true } },
            track: { select: { name: true } },
          },
        },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({
      where: { ...where, status: "completed" },
      _sum: { amountTotal: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildUrl(overrides: Record<string, string | number>) {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (period !== "all") p.set("period", period);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "all" || v === "" || v === 1) {
        p.delete(k);
      } else {
        p.set(k, String(v));
      }
    }
    const qs = p.toString();
    return `/admin/orders${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Orders</h1>
      </div>

      {/* Search + Period Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form action="/admin/orders" method="get" className="flex gap-2">
          {period !== "all" && (
            <input type="hidden" name="period" value={period} />
          )}
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by email..."
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>
            Search
          </button>
          {query && (
            <Link
              href={buildUrl({ q: "" })}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" })
              )}
            >
              Clear
            </Link>
          )}
        </form>

        <div className="flex gap-1 items-center">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={buildUrl({ period: p.value, page: 1 })}
              className={cn(
                buttonVariants({
                  variant: p.value === period ? "default" : "ghost",
                  size: "sm",
                })
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="glass-panel rounded-lg p-4 mb-6 flex gap-8">
        <div>
          <div className="text-xs text-muted-foreground">Revenue</div>
          <div className="text-lg font-semibold">
            {formatCurrency(totals._sum.amountTotal ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Completed Orders</div>
          <div className="text-lg font-semibold">{totals._count}</div>
        </div>
      </div>

      {/* Orders Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
            <TableHead className="text-right">Stripe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">#{order.id}</TableCell>
              <TableCell className="text-sm">
                {order.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell className="text-sm">{order.email}</TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                {order.items
                  .map((i) => i.release?.name ?? i.track?.name ?? "—")
                  .join(", ")}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(order.amountTotal)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={
                    order.status === "completed"
                      ? "default"
                      : order.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {order.stripePaymentId ? (
                  <a
                    href={`https://dashboard.stripe.com/payments/${order.stripePaymentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs neon-link"
                  >
                    View ↗
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-muted-foreground py-8"
              >
                No orders found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} orders)
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: page - 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ page: page + 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
