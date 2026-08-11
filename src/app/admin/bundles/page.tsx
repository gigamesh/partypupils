import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { releases } from "@/db/schema";
import { getBundlesConfig } from "@/lib/bundles";
import { BundlesEditor } from "./BundlesEditor";

export const dynamic = "force-dynamic";

export default async function AdminBundlesPage() {
  const [config, pickerReleases] = await Promise.all([
    getBundlesConfig(),
    db
      .select({
        id: releases.id,
        name: releases.name,
        slug: releases.slug,
        price: releases.price,
        coverImageUrl: releases.coverImageUrl,
      })
      .from(releases)
      .where(eq(releases.isPublished, true))
      .orderBy(releases.name),
  ]);

  return (
    <div>
      <h1>Bundles</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Discounted packs shown on <code>/music</code>, above the release grid. Each
        bundle is priced as a percentage off the sum of its releases. The
        complete-catalog bundle is always listed last and is configured under{" "}
        <code>Settings</code>.
      </p>
      <BundlesEditor initialBundles={config.bundles} releases={pickerReleases} />
    </div>
  );
}
