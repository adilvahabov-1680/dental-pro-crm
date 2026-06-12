import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** Базовый строительный блок интерфейса — см. DESIGN.md §4. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-surface/80 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
