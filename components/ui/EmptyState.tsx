import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Обязательное пустое состояние (DESIGN.md §4): иконка + фраза + CTA. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Icon className="size-7" strokeWidth={1.5} />
      </div>
      <p className="text-base font-medium text-text-primary">{title}</p>
      {description && (
        <p className="max-w-md text-sm leading-relaxed text-text-secondary">{description}</p>
      )}
      {action}
    </div>
  );
}
