import Link from "next/link";
import { ChevronRight, Building2 } from "lucide-react";
import type { SupplierRow } from "@/lib/suppliers";
import type { Dict } from "@/i18n/az";

export function SupplierList({
  suppliers,
  dict,
}: {
  suppliers: SupplierRow[];
  dict: Dict["suppliers"];
}) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-surface/60 px-6 py-12 text-center">
        <Building2 className="mx-auto mb-3 size-10 text-text-secondary/40" />
        <p className="font-medium text-text-primary">{dict.empty.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{dict.empty.desc}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-surface/80">
      {suppliers.map((s) => (
        <li key={s.id}>
          <Link
            href={`/inventory/suppliers/${s.id}`}
            className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-bg-surface"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-text-primary">{s.name}</p>
              {s.contactName && (
                <p className="truncate text-sm text-text-secondary">{s.contactName}</p>
              )}
              {s.phone && !s.contactName && (
                <p className="text-sm text-text-secondary">{s.phone}</p>
              )}
            </div>
            <ChevronRight className="ml-3 size-4 shrink-0 text-text-secondary/50" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
