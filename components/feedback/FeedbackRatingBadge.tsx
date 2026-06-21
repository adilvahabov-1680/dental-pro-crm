import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Компактный индикатор рейтинга 1–5 (заполненные/пустые звёзды + число). */
export function FeedbackRatingBadge({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-warning" data-e2e-marker="feedback-rating-badge">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= rating ? "fill-current" : "text-text-secondary/30")} />
      ))}
      <span className="ml-0.5 text-xs font-medium tabular-nums text-text-primary">{rating}/5</span>
    </span>
  );
}
