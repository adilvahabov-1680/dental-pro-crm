import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, Pencil } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  getInventoryItemForUser,
  listItemMovements,
  inventoryStatus,
  formatQty,
} from "@/lib/inventory";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { InventoryStatusBadge } from "@/components/inventory/InventoryStatusBadge";
import { StockCorrectionForm } from "@/components/inventory/StockCorrectionForm";
import { InventoryMovementsList } from "@/components/inventory/InventoryMovementsList";
import { ArchiveInventoryItemButton } from "@/components/inventory/ArchiveInventoryItemButton";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-right text-sm tabular-nums text-text-primary">{value ?? "—"}</span>
    </div>
  );
}

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("inventory.view");
  const t = getDict(user.locale);
  const ti = t.inventory;
  const { id } = await params;

  // tenant: чужой материал → 404
  const item = await getInventoryItemForUser(user, id);
  if (!item) notFound();

  const canManage = hasPermission(user, "inventory.manage");
  const movements = await listItemMovements(user, item.id);
  const status = inventoryStatus(item);

  return (
    <>
      <PageHeader
        title={item.name}
        description={item.category?.name ?? "—"}
        actions={
          <div className="flex items-center gap-2">
            <InventoryStatusBadge status={status} />
            {canManage && (
              <Link
                href={`/inventory/${item.id}/edit`}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
              >
                <Pencil className="size-4" /> {ti.item.edit}
              </Link>
            )}
            <Link
              href="/inventory"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
            >
              <ArrowLeft className="size-4" /> {t.modules.inventory.title}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Package className="size-5" />
              </div>
              <p className="text-2xl font-semibold tabular-nums text-text-primary">
                {formatQty(item.quantity)}{" "}
                <span className="text-sm font-normal text-text-secondary">{item.unit}</span>
              </p>
            </div>
            <div className="divide-y divide-border-subtle/50">
              <InfoRow label={ti.item.unit} value={item.unit} />
              <InfoRow label={ti.item.minQuantity} value={`${formatQty(item.minQuantity)} ${item.unit}`} />
              {item.purchaseUnit && (
                <InfoRow
                  label={ti.item.purchaseUnit}
                  value={`1 ${item.purchaseUnit} = ${Number(item.purchaseToBaseFactor)} ${item.unit}`}
                />
              )}
              {item.doseToBaseFactor && (
                <InfoRow
                  label={ti.item.doseConversion}
                  value={`1 doza = ${Number(item.doseToBaseFactor)} ${item.unit}`}
                />
              )}
              <InfoRow
                label={ti.item.purchasePrice}
                value={item.unitCost != null ? formatMoney(item.unitCost) : null}
              />
              <InfoRow label={ti.item.supplier} value={item.supplier?.name} />
              <InfoRow
                label={ti.item.expiresAt}
                value={item.expiresAt ? formatDate(item.expiresAt) : null}
              />
            </div>
          </Card>

          {canManage && (
            <Card className="border-accent/20 bg-accent/5 p-5">
              <StockCorrectionForm
                inventoryItemId={item.id}
                unit={item.unit}
                currentQuantity={Number(item.quantity)}
                labels={{ ...ti.correction }}
                errors={ti.errors}
              />
            </Card>
          )}

          {canManage && (
            <Card className="border-danger/20 p-5">
              <ArchiveInventoryItemButton
                itemId={item.id}
                labels={{ ...ti.archive }}
                errors={ti.errors}
              />
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold text-accent">
            {ti.movement.history}{" "}
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] tabular-nums text-text-secondary">
              {movements.length}
            </span>
          </h2>
          <InventoryMovementsList
            movements={movements}
            unit={item.unit}
            labels={{ historyEmpty: ti.movement.historyEmpty, by: ti.movement.by }}
          />
        </Card>
      </div>
    </>
  );
}
