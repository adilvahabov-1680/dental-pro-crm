"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { importSupplierCatalogExcel } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/Button";
import type { CatalogImportState } from "@/lib/validation/suppliers";
import type { Dict } from "@/i18n/az";

export function ImportExcelForm({
  supplierId,
  dict,
}: {
  supplierId: string;
  dict: Dict["suppliers"];
}) {
  const [result, setResult] = useState<CatalogImportState | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const im = dict.import;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const res = await importSupplierCatalogExcel(supplierId, fd);
      setResult(res);
      if (!res.error && fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5">
      <h3 className="mb-1 text-sm font-semibold">{im.title}</h3>
      <p className="mb-3 text-xs text-text-secondary">{im.desc}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {im.file}
          </label>
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent hover:file:bg-accent/20"
          />
        </div>

        <Button type="submit" disabled={isPending} variant="secondary">
          <Upload className="size-3.5" />
          {isPending ? im.submitting : im.submit}
        </Button>
      </form>

      {result?.error && (
        <p className="mt-3 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[result.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}

      {result && !result.error && (
        <p className="mt-3 rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {im.result
            .replace("{inserted}", String(result.inserted ?? 0))
            .replace("{updated}", String(result.updated ?? 0))
            .replace("{skipped}", String(result.skipped ?? 0))}
        </p>
      )}
    </div>
  );
}
