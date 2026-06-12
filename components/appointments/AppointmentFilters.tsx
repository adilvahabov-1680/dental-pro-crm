"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const selectCls =
  "h-9 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 px-2.5 text-xs text-text-primary outline-none transition-colors focus:border-accent [&>option]:bg-bg-elevated";

export function AppointmentFilters({
  doctors,
  showDoctorFilter,
  todayStr,
  labels,
}: {
  doctors: Array<{ id: string; name: string }>;
  showDoctorFilter: boolean;
  todayStr: string;
  labels: { date: string; doctor: string; all: string; searchPlaceholder: string; today: string; reset: string };
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

  const date = params.get("date") ?? todayStr;
  const isToday = date === todayStr;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="date"
        aria-label={labels.date}
        value={date}
        onChange={(e) => setParam("date", e.target.value)}
        className={cn(selectCls, "tabular-nums")}
      />
      {!isToday && (
        <button
          type="button"
          onClick={() => setParam("date", "")}
          className="h-9 cursor-pointer rounded-[10px] px-2.5 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {labels.today}
        </button>
      )}
      {showDoctorFilter && (
        <select
          aria-label={labels.doctor}
          className={selectCls}
          value={params.get("doctor") ?? ""}
          onChange={(e) => setParam("doctor", e.target.value)}
        >
          <option value="">
            {labels.doctor}: {labels.all}
          </option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      {[...params.keys()].some((k) => k !== "view") && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            const view = params.get("view");
            router.push(view ? `${pathname}?view=${view}` : pathname);
          }}
          className="flex h-9 cursor-pointer items-center gap-1 rounded-[10px] px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <X className="size-3.5" /> {labels.reset}
        </button>
      )}
    </div>
  );
}
