import {
  getBundlesConfig,
  listPickerReleases,
  listPickerTracks,
} from "@/lib/bundles";
import { BundlesEditor } from "./BundlesEditor";

export const dynamic = "force-dynamic";

export default async function AdminBundlesPage() {
  const [config, pickerReleases, pickerTracks] = await Promise.all([
    getBundlesConfig(),
    listPickerReleases(),
    listPickerTracks(),
  ]);

  return (
    <div>
      <h1>Bundles</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Discounted packs shown on <code>/music</code>, above the release grid. A bundle
        holds either whole releases or individual songs, and is priced as a percentage
        off the sum of its members. The complete-catalog bundle is always listed last
        and is configured under <code>Settings</code>.
      </p>
      <BundlesEditor
        initialBundles={config.bundles}
        releases={pickerReleases}
        tracks={pickerTracks}
      />
    </div>
  );
}
