import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { ActivityRow } from "@/lib/dashboard";

export function RecentActivityPanel({
  rows,
  labels,
}: {
  rows: ActivityRow[];
  labels: {
    title: string;
    empty: string;
    entities: Record<string, string>;
    actions: Record<string, string>;
  };
}) {
  const fmt = (dt: Date) =>
    `${new Date(dt).toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit" })} ${new Date(
      dt,
    ).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <History className="size-4 text-info" /> {labels.title}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-4 text-center text-xs text-text-secondary">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-subtle bg-bg-base/50 px-3 py-2"
            >
              <span className="text-xs text-text-primary">
                {labels.entities[r.entityType] ?? r.entityType}{" "}
                <span className="text-text-secondary">
                  {labels.actions[r.action] ?? r.action}
                </span>
              </span>
              <span className="text-xs text-text-secondary">{r.userName}</span>
              <span className="text-[11px] tabular-nums text-text-secondary/70">
                {fmt(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
