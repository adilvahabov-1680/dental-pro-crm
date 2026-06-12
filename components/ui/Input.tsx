import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: Props) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "h-10 w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 text-sm text-text-primary placeholder:text-text-secondary/60",
          "outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30",
          error && "border-danger focus:border-danger focus:ring-danger/30",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
