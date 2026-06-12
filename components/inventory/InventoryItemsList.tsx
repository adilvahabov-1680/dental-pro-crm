import { PackageOpen } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InventoryItemCard } from "@/components/inventory/InventoryItemCard";
import type { InventoryItemFull } from "@/lib/inventory";

export function InventoryItemsList({
  items,
  labels,
  empty,
}: {
  items: InventoryItemFull[];
  labels: { minQuantity: string };
  empty: { title: string; desc: string };
}) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={PackageOpen} title={empty.title} description={empty.desc} />
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <InventoryItemCard key={item.id} item={item} labels={labels} />
      ))}
    </div>
  );
}
