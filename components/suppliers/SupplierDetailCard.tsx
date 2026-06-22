"use client";

import { useState, useActionState } from "react";
import { Phone, MessageCircle, Mail, MapPin, Pencil } from "lucide-react";
import { updateSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SupplierRow } from "@/lib/suppliers";
import type { SupplierFormState } from "@/lib/validation/suppliers";
import type { Dict } from "@/i18n/az";

export function SupplierDetailCard({
  supplier,
  dict,
  canManage,
}: {
  supplier: SupplierRow;
  dict: Dict["suppliers"];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SupplierFormState | undefined, FormData>(
    updateSupplier,
    undefined,
  );
  const f = dict.form;
  const d = dict.detail;
  const err = (key: string) =>
    state?.fieldErrors?.[key]
      ? (dict.errors[state.fieldErrors[key] as keyof typeof dict.errors] ?? dict.errors.generic)
      : undefined;

  if (editing) {
    return (
      <form
        action={formAction}
        className="space-y-4 rounded-2xl border border-border-subtle bg-bg-surface/80 p-5"
      >
        <input type="hidden" name="supplierId" value={supplier.id} />
        <h2 className="text-base font-semibold">{f.editTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              id="edit-name"
              name="name"
              label={f.name}
              required
              defaultValue={supplier.name}
              error={err("name")}
            />
          </div>
          <Input
            id="edit-contactName"
            name="contactName"
            label={f.contactName}
            defaultValue={supplier.contactName ?? ""}
          />
          <Input
            id="edit-phone"
            name="phone"
            label={f.phone}
            type="tel"
            defaultValue={supplier.phone ?? ""}
          />
          <Input
            id="edit-whatsapp"
            name="whatsapp"
            label={f.whatsapp}
            type="tel"
            defaultValue={supplier.whatsapp ?? ""}
          />
          <Input
            id="edit-email"
            name="email"
            label={f.email}
            type="email"
            defaultValue={supplier.email ?? ""}
            error={err("email")}
          />
          <div className="sm:col-span-2">
            <Input
              id="edit-address"
              name="address"
              label={f.address}
              defaultValue={supplier.address ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              id="edit-notes"
              name="notes"
              label={f.notes}
              defaultValue={supplier.notes ?? ""}
            />
          </div>
        </div>
        {state?.error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? f.saving : f.save}
          </Button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {f.cancel}
          </button>
        </div>
      </form>
    );
  }

  const hasContact = supplier.contactName || supplier.phone || supplier.whatsapp || supplier.email || supplier.address;

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{supplier.name}</h2>
          {supplier.contactName && (
            <p className="mt-0.5 text-sm text-text-secondary">{supplier.contactName}</p>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
            title={f.editTitle}
            aria-label={f.editTitle}
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      {hasContact ? (
        <dl className="mt-4 space-y-2">
          {supplier.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="size-4 shrink-0 text-text-secondary/60" />
              <span className="text-text-primary">{supplier.phone}</span>
            </div>
          )}
          {supplier.whatsapp && (
            <div className="flex items-center gap-2 text-sm">
              <MessageCircle className="size-4 shrink-0 text-text-secondary/60" />
              <span className="text-text-primary">{supplier.whatsapp}</span>
            </div>
          )}
          {supplier.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 shrink-0 text-text-secondary/60" />
              <span className="text-text-primary">{supplier.email}</span>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 shrink-0 text-text-secondary/60" />
              <span className="text-text-primary">{supplier.address}</span>
            </div>
          )}
          {supplier.notes && (
            <p className="mt-3 rounded-[10px] bg-bg-base/50 px-3 py-2 text-sm text-text-secondary">
              {supplier.notes}
            </p>
          )}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">{d.noContact}</p>
      )}
    </div>
  );
}
