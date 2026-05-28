import { prisma } from "@/lib/db";
import { CATALOG_DISCOUNT_KEY, DEFAULT_DISCOUNT_PERCENT } from "@/lib/constants";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const discountSetting = await prisma.siteSetting.findUnique({
    where: { key: CATALOG_DISCOUNT_KEY },
  });

  return (
    <div>
      <h1>Settings</h1>
      <SettingsForm
        catalogDiscount={discountSetting?.value || String(DEFAULT_DISCOUNT_PERCENT)}
      />
    </div>
  );
}
