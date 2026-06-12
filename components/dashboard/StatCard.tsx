import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type Tone = "accent" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
};

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "accent",
}: {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card className="group p-5 transition-colors duration-150 hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            toneClasses[tone],
          )}
        >
          <Icon className="size-5" strokeWidth={1.7} />
        </div>
      </div>
    </Card>
  );
}
