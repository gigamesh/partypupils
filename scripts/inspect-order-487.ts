/**
 * One-off: inspect order #487 to debug missing/duplicate track entries.
 *   Run: npx dotenv -e .env.prod -- npx tsx scripts/inspect-order-487.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const order = await prisma.order.findUnique({
    where: { id: 487 },
    include: {
      items: {
        include: {
          release: {
            include: {
              tracks: {
                orderBy: { trackNumber: "asc" },
                include: { files: { select: { format: true } } },
              },
            },
          },
          track: {
            include: {
              files: { select: { format: true } },
              release: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!order) {
    console.log("Order 487 not found");
    return;
  }

  console.log(`Order #${order.id}  email=${order.email}  total=${order.amountTotal}`);
  console.log(`Status: ${order.status}`);
  console.log("Items:");
  for (const item of order.items) {
    if (item.release) {
      console.log(
        `  [release] id=${item.releaseId} name="${item.release.name}" tracks=${item.release.tracks.length}`,
      );
      for (const t of item.release.tracks) {
        const formats = t.files.map((f) => f.format).join(",") || "(none)";
        console.log(
          `      track ${t.trackNumber}. id=${t.id} name="${t.name}" formats=${formats}`,
        );
      }
    } else if (item.track) {
      const formats = item.track.files.map((f) => f.format).join(",") || "(none)";
      console.log(
        `  [track] orderItem.id=${item.id} trackId=${item.track.id} name="${item.track.name}" formats=${formats} releaseId=${item.track.release?.id ?? "—"} releaseName="${item.track.release?.name ?? "—"}"`,
      );
    } else {
      console.log(`  [orphan] orderItem.id=${item.id}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
