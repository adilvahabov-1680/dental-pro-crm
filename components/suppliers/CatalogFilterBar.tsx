"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Dict } from "@/i18n/az";

export function CatalogFilterBar({
  categories,
  dict,
  supplierId,
}: {
  categories: string[];
  dict: Dict["suppliers"];
  supplierId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const f = dict.filters;

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(sp.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/inventory/suppliers/${supplierId}?${params.toString()}`);
    },
    [router, sp, supplierId],
  );

  const currentQ = sp.get("q") ?? "";
  const currentCategory = sp.get("category") ?? "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder={f.searchPlaceholder}
        defaultValue={currentQ}
        onChange={(e) => update("q", e.target.value || null)}
        className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface/80 px-3 text-sm placeholder:text-text-secondary/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      />

      {categories.length > 0 && (
        <select
          value={currentCategory}
          onChange={(e) => update("category", e.target.value || null)}
          className="h-9 rounded-[10px] border border-border-subtle bg-bg-surface/80 px-3 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        >
          <option value="">{f.all}</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      )}

      {(currentQ || currentCategory) && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            router.push(`/inventory/suppliers/${supplierId}?${params.toString()}`);
          }}
          className="text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          {f.reset}
        </button>
      )}
    </div>
  );
}
