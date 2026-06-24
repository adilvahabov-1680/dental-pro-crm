import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import {
  getInventoryItemForUser,
  hasLinkedInventoryRecords,
  listInventoryCategories,
} from "@/lib/inventory";
import { updateInventoryItem } from "@/lib/actions/inventory";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryItemForm } from "@/components/inventory/InventoryItemForm";

export default async function EditInventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("inventory.manage");
  const t = getDict(user.locale);
  const { id } = await params;

  // tenant + isActive: чужой/архивный материал → 404
  const item = await getInventoryItemForUser(user, id);
  if (!item || !item.isActive) notFound();

  const [categories, hasLinkedRecords] = await Promise.all([
    listInventoryCategories(user),
    hasLinkedInventoryRecords(user, item.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.inventory.form.editTitle} description={item.name} />
      <InventoryItemForm
        action={updateInventoryItem}
        dict={t.inventory}
        categories={categories}
        initial={{
          id: item.id,
          name: item.name,
          categoryId: item.categoryId,
          unit: item.unit,
          purchaseUnit: item.purchaseUnit,
          purchaseToBaseFactor: item.purchaseToBaseFactor,
          doseToBaseFactor: item.doseToBaseFactor,
          minQuantity: item.minQuantity,
          purchasePrice: item.unitCost != null ? (item.unitCost / 100).toFixed(2) : "",
          supplierName: item.supplier?.name ?? "",
          expiresAt: item.expiresAt ? item.expiresAt.toISOString().slice(0, 10) : "",
          quantity: item.quantity,
          hasLinkedRecords,
        }}
      />
    </div>
  );
}
