"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const selectCls =
  "h-9 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 px-2.5 text-xs text-text-primary outline-none transition-colors focus:border-accent [&>option]:bg-bg-elevated";

export function InventoryFilterBar({
  categories,
  labels,
}: {
  categories: Array<{ id: string; name: string }>;
  labels: { category: string; all: string; lowOnly: string; searchPlaceholder: string; reset: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q);
    }, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const lowOnly = params.get("low") === "1";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <select
        aria-label={labels.category}
        className={selectCls}
        value={params.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
      >
        <option value="">
          {labels.category}: {labels.all}
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setParam("low", lowOnly ? "" : "1")}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 text-xs transition-colors",
          lowOnly
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border-subtle bg-bg-base/60 text-text-secondary hover:bg-bg-elevated",
        )}
      >
        <TriangleAlert className="size-3.5" /> {labels.lowOnly}
      </button>
      {[...params.keys()].length > 0 && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
          className="flex h-9 cursor-pointer items-center gap-1 rounded-[10px] px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <X className="size-3.5" /> {labels.reset}
        </button>
      )}
    </div>
  );
}
