"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { GlobalSearchResult, SearchResultItem } from "@/lib/search";

const GROUP_ORDER: Array<keyof GlobalSearchResult> = [
  "patients",
  "appointments",
  "invoices",
  "documents",
  "services",
];

export function GlobalSearch({
  labels,
}: {
  labels: {
    placeholder: string;
    minLength: string;
    loading: string;
    empty: string;
    groups: Record<keyof GlobalSearchResult, string>;
  };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = q.trim();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmed.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        setResult(res.ok ? ((await res.json()) as GlobalSearchResult) : null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const groups = result
    ? GROUP_ORDER.map((key) => ({ key, items: result[key] })).filter((g) => g.items.length > 0)
    : [];
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  const showDropdown = open && trimmed.length > 0;

  function go(item: SearchResultItem) {
    setOpen(false);
    setQ("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && groups[0]?.items[0]) go(groups[0].items[0]);
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative hidden max-w-sm flex-1 md:flex">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-text-secondary" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={labels.placeholder}
        className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-surface/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {showDropdown && (
        <div className="absolute left-0 top-11 z-40 max-h-[70vh] w-full overflow-y-auto rounded-[10px] border border-border-subtle bg-bg-elevated shadow-xl">
          {trimmed.length < 2 ? (
            <p className="px-3 py-3 text-xs text-text-secondary">{labels.minLength}</p>
          ) : loading ? (
            <p className="px-3 py-3 text-xs text-text-secondary">{labels.loading}</p>
          ) : totalCount === 0 ? (
            <p className="px-3 py-3 text-xs text-text-secondary">{labels.empty}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="border-b border-border-subtle/60 py-1.5 last:border-b-0">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  {labels.groups[g.key]}
                </p>
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-base"
                  >
                    <span className="text-sm text-text-primary">{item.title}</span>
                    {item.subtitle && (
                      <span className="text-[11px] text-text-secondary">{item.subtitle}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
