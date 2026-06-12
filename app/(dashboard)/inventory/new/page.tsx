import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { listInventoryCategories } from "@/lib/inventory";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryItemForm } from "@/components/inventory/InventoryItemForm";

export default async function NewInventoryItemPage() {
  const user = await requirePermission("inventory.manage");
  const t = getDict(user.locale);
  const categories = await listInventoryCategories(user);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.inventory.form.title} description={t.inventory.form.desc} />
      <InventoryItemForm dict={t.inventory} categories={categories} />
    </div>
  );
}
