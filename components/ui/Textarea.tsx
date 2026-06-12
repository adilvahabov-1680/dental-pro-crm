import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: Props) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm text-text-secondary">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={3}
        className={cn(
          "w-full rounded-[10px] border border-border-subtle bg-bg-base/60 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60",
          "outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30",
          error && "border-danger",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
