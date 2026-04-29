/**
 * Audit OrderItems to detect rows whose track/release reference was nulled out
 * by past delete-and-recreate Update Release calls.
 *
 *   Run: npx dotenv -e .env.prod -- npx tsx scripts/audit-orphan-orderitems.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const total = await prisma.orderItem.count();
  const releasePurchase = await prisma.orderItem.count({
    where: { releaseId: { not: null }, trackId: null },
  });
  const trackPurchase = await prisma.orderItem.count({
    where: { trackId: { not: null }, releaseId: null },
  });
  const bothSet = await prisma.orderItem.count({
    where: { trackId: { not: null }, releaseId: { not: null } },
  });
  const orphaned = await prisma.orderItem.count({
    where: { trackId: null, releaseId: null },
  });

  console.log("OrderItem audit");
  console.log("---------------");
  console.log(`Total rows                  : ${total}`);
  console.log(`Release purchase (releaseId): ${releasePurchase}`);
  console.log(`Track purchase   (trackId)  : ${trackPurchase}`);
  console.log(`Both set (unusual)          : ${bothSet}`);
  console.log(`Both NULL (orphaned)        : ${orphaned}`);

  if (orphaned > 0) {
    console.log("\nOrphaned items (most recent 20):");
    const samples = await prisma.orderItem.findMany({
      where: { trackId: null, releaseId: null },
      orderBy: { id: "desc" },
      take: 20,
      include: { order: { select: { email: true, createdAt: true, status: true } } },
    });
    for (const it of samples) {
      console.log(
        `  item ${it.id}  order=${it.orderId}  price=${it.price}c  ${it.order.status}  ${it.order.createdAt.toISOString()}  ${it.order.email}`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
