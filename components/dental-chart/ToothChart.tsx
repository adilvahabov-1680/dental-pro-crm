"use client";

import { useRouter } from "next/navigation";
import { ToothIcon } from "@/components/ui/ToothIcon";
import { toothStyle } from "@/components/dental-chart/status-styles";
import { cn } from "@/lib/utils";

export interface ToothCell {
  number: number;
  status: string;
}

function ToothButton({
  tooth,
  selected,
  onSelect,
}: {
  tooth: ToothCell;
  selected: boolean;
  onSelect: (n: number) => void;
}) {
  const style = toothStyle(tooth.status);
  return (
    <button
      type="button"
      onClick={() => onSelect(tooth.number)}
      title={`${tooth.number}`}
      className={cn(
        "group flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-1.5 py-2 transition-all duration-150",
        "hover:bg-bg-elevated hover:-translate-y-0.5",
        selected &&
          "bg-accent/10 ring-2 ring-accent shadow-[0_0_16px_rgb(34_211_238/0.25)]",
        style.btn,
      )}
    >
      <ToothIcon
        className={cn(
          "size-7 transition-colors sm:size-8",
          style.icon,
          selected && "drop-shadow-[0_0_6px_rgb(34_211_238/0.5)]",
        )}
      />
      <span
        className={cn(
          "text-[11px] font-medium tabular-nums",
          selected ? "text-accent" : "text-text-secondary group-hover:text-text-primary",
        )}
      >
        {tooth.number}
      </span>
      <span className={cn("size-1.5 rounded-full", toothStyle(tooth.status).dot)} />
    </button>
  );
}

function JawRow({
  teeth,
  byNumber,
  selected,
  onSelect,
}: {
  teeth: number[];
  byNumber: Map<number, ToothCell>;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const mid = teeth.length / 2;
  return (
    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
      {teeth.map((n, i) => (
        <span key={n} className="flex items-center">
          {i === mid && <span className="mx-1.5 h-10 w-px shrink-0 bg-border-subtle sm:mx-3" />}
          <ToothButton
            tooth={byNumber.get(n) ?? { number: n, status: "healthy" }}
            selected={selected === n}
            onSelect={onSelect}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Интерактивная зубная карта (data-driven: взрослая и детская — один компонент).
 * Выбор зуба пишется в URL (?tooth=NN) — карточка зуба рендерится сервером.
 */
export function ToothChart({
  upper,
  lower,
  teeth,
  selected,
  basePath,
  labels,
}: {
  upper: number[];
  lower: number[];
  teeth: ToothCell[];
  selected: number | null;
  basePath: string;
  labels: { upperJaw: string; lowerJaw: string };
}) {
  const router = useRouter();
  const byNumber = new Map(teeth.map((t) => [t.number, t]));
  const onSelect = (n: number) =>
    router.push(`${basePath}?tooth=${n}`, { scroll: false });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit space-y-1 py-2">
        <p className="text-center text-[11px] uppercase tracking-wider text-text-secondary">
          {labels.upperJaw}
        </p>
        <JawRow teeth={upper} byNumber={byNumber} selected={selected} onSelect={onSelect} />
        <div className="mx-auto my-2 h-px max-w-2xl bg-linear-to-r from-transparent via-border-subtle to-transparent" />
        <JawRow teeth={lower} byNumber={byNumber} selected={selected} onSelect={onSelect} />
        <p className="text-center text-[11px] uppercase tracking-wider text-text-secondary">
          {labels.lowerJaw}
        </p>
      </div>
    </div>
  );
}
