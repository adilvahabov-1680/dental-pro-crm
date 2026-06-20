import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/Card";

/** Dashboard-тизер «Kontrol xatırlatmaları» (сессия 44) — счётчики + ссылка на /recalls. */
export function RecallSummaryPanel({
  overdue,
  dueSoon,
  labels,
}: {
  overdue: number;
  dueSoon: number;
  labels: { title: string; overdue: string; dueSoon: string; empty: string; viewAll: string };
}) {
  const total = overdue + dueSoon;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="size-4 text-accent" /> {labels.title}
        </h2>
        <Link
          href="/recalls"
          className="text-xs text-text-secondary transition-colors hover:text-accent"
        >
          {labels.viewAll} →
        </Link>
      </div>
      {total === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/recalls"
            className="flex-1 rounded-[10px] border border-danger/30 bg-danger/5 px-3 py-2 text-center transition-colors hover:bg-danger/10"
          >
            <span className="block text-lg font-semibold tabular-nums text-danger">{overdue}</span>
            <span className="text-[11px] text-text-secondary">{labels.overdue}</span>
          </Link>
          <Link
            href="/recalls"
            className="flex-1 rounded-[10px] border border-warning/30 bg-warning/5 px-3 py-2 text-center transition-colors hover:bg-warning/10"
          >
            <span className="block text-lg font-semibold tabular-nums text-warning">{dueSoon}</span>
            <span className="text-[11px] text-text-secondary">{labels.dueSoon}</span>
          </Link>
        </div>
      )}
    </Card>
  );
}
