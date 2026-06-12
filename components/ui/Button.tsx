import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-br from-accent to-accent-deep text-bg-base font-semibold shadow-[0_4px_16px_rgb(34_211_238/0.25)] hover:opacity-90",
  secondary:
    "bg-bg-surface border border-border-subtle text-text-primary hover:bg-bg-elevated",
  ghost: "text-text-secondary hover:text-text-primary hover:bg-bg-elevated",
  danger: "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
