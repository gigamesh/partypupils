import { prisma } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const discountSetting = await prisma.siteSetting.findUnique({
    where: { key: "catalog_discount_percent" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm
        catalogDiscount={discountSetting?.value || "15"}
      />
    </div>
  );
}
