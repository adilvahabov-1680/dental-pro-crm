"use client";

import { useActionState } from "react";
import { Archive } from "lucide-react";
import { archiveInventoryItemAction } from "@/lib/actions/inventory";
import { Button } from "@/components/ui/Button";
import type { InventoryFormState } from "@/lib/validation/inventory";

export function ArchiveInventoryItemButton({
  itemId,
  labels,
  errors,
}: {
  itemId: string;
  labels: { title: string; warning: string; button: string; archiving: string; confirm: string };
  errors: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<InventoryFormState | undefined, FormData>(
    archiveInventoryItemAction,
    undefined,
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(labels.confirm)) e.preventDefault();
      }}
      className="space-y-3"
      data-e2e-marker="archive-inventory-item-form"
    >
      <input type="hidden" name="id" value={itemId} />
      <h3 className="text-sm font-semibold text-text-primary">{labels.title}</h3>
      <p className="text-xs text-text-secondary">{labels.warning}</p>
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errors[state.error] ?? errors.generic}
        </p>
      )}
      <Button type="submit" variant="danger" disabled={pending} className="w-full">
        <Archive className="size-4" /> {pending ? labels.archiving : labels.button}
      </Button>
    </form>
  );
}
