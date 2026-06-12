import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, id, children, ...props }: Props) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm text-text-secondary">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          "h-10 w-full cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary",
          "outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30",
          "[&>option]:bg-bg-elevated [&>option]:text-text-primary",
          error && "border-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
