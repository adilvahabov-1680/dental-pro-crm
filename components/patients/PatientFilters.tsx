"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface DoctorOption {
  id: string;
  name: string;
}

interface Labels {
  searchPlaceholder: string;
  doctor: string;
  type: string;
  gender: string;
  allergy: string;
  status: string;
  created: string;
  all: string;
  adult: string;
  child: string;
  male: string;
  female: string;
  hasAllergy: string;
  active: string;
  archived: string;
  recent30: string;
  reset: string;
}

const selectCls =
  "h-9 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 px-2.5 text-xs text-text-primary outline-none transition-colors focus:border-accent [&>option]:bg-bg-elevated";

export function PatientFilters({ doctors, labels }: { doctors: DoctorOption[]; labels: Labels }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: URLSearchParams) {
    next.delete("page"); // фильтры сбрасывают пагинацию
    router.push(`${pathname}?${next.toString()}`);
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  // debounce поиска 400ms
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

  const hasFilters = [...params.keys()].some((k) => k !== "page");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-55 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <select
        aria-label={labels.doctor}
        className={selectCls}
        value={params.get("doctor") ?? ""}
        onChange={(e) => setParam("doctor", e.target.value)}
      >
        <option value="">{labels.doctor}: {labels.all}</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.type}
        className={selectCls}
        value={params.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
      >
        <option value="">{labels.type}: {labels.all}</option>
        <option value="adult">{labels.adult}</option>
        <option value="child">{labels.child}</option>
      </select>

      <select
        aria-label={labels.gender}
        className={selectCls}
        value={params.get("gender") ?? ""}
        onChange={(e) => setParam("gender", e.target.value)}
      >
        <option value="">{labels.gender}: {labels.all}</option>
        <option value="male">{labels.male}</option>
        <option value="female">{labels.female}</option>
      </select>

      <select
        aria-label={labels.allergy}
        className={selectCls}
        value={params.get("allergy") ?? ""}
        onChange={(e) => setParam("allergy", e.target.value)}
      >
        <option value="">{labels.allergy}: {labels.all}</option>
        <option value="yes">{labels.hasAllergy}</option>
      </select>

      <select
        aria-label={labels.status}
        className={selectCls}
        value={params.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="">{labels.status}: {labels.active}</option>
        <option value="archived">{labels.archived}</option>
      </select>

      <select
        aria-label={labels.created}
        className={selectCls}
        value={params.get("created") ?? ""}
        onChange={(e) => setParam("created", e.target.value)}
      >
        <option value="">{labels.created}: {labels.all}</option>
        <option value="recent30">{labels.recent30}</option>
      </select>

      {hasFilters && (
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
