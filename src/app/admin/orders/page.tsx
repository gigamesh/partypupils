export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { release: true, track: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Email</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="text-sm">
                {order.createdAt.toLocaleDateString()}
              </TableCell>
              <TableCell className="text-sm text-right">{order.email}</TableCell>
              <TableCell className="text-sm text-right">
                {order.items.map((i) => i.release?.name || i.track?.name || "—").join(", ")}
              </TableCell>
              <TableCell className="text-sm text-right">
                {formatCurrency(order.amountTotal)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={order.status === "completed" ? "default" : "secondary"}
                >
                  {order.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No orders yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
