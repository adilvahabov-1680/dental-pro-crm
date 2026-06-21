"use client";

import { useActionState, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { submitFeedbackAction } from "@/lib/actions/patient-response";
import type { PatientResponseFormState } from "@/lib/validation/patient-response";
import { cn } from "@/lib/utils";

/**
 * Public (no-login) форма отзыва 1–5 (сессия 45). Рейтинг — звёзды-кнопки,
 * пишущие выбранное значение в скрытый input (без него submit не пройдёт
 * валидацию rating 1–5 на сервере — отсутствующее/0 значение отклоняется).
 */
export function FeedbackForm({
  token,
  labels,
}: {
  token: string;
  labels: {
    ratingLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    submit: string;
    submitting: string;
    thankYou: string;
    errors: Record<string, string>;
  };
}) {
  const [state, formAction, pending] = useActionState<PatientResponseFormState | undefined, FormData>(
    submitFeedbackAction,
    undefined,
  );
  const [rating, setRating] = useState(0);

  if (state?.success) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[10px] border border-success/30 bg-success/10 px-4 py-6 text-center"
        data-e2e-marker="feedback-success"
      >
        <CheckCircle2 className="size-8 text-success" />
        <p className="text-sm font-medium text-success">{labels.thankYou}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" data-e2e-marker="feedback-form">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />

      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">{labels.ratingLabel}</p>
        <div className="flex gap-1.5" data-e2e-marker="feedback-rating-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              data-e2e-marker={`feedback-star-${n}`}
              aria-label={`${n}/5`}
              className={cn(
                "flex size-10 items-center justify-center rounded-[10px] border transition-colors",
                n <= rating
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border-subtle bg-bg-base text-text-secondary hover:text-warning",
              )}
            >
              <Star className={cn("size-5", n <= rating && "fill-current")} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">{labels.commentLabel}</label>
        <textarea
          name="comment"
          placeholder={labels.commentPlaceholder}
          rows={3}
          maxLength={1000}
          disabled={pending}
          className="w-full rounded-[10px] border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-danger" data-e2e-marker="feedback-error">
          {labels.errors[state.error] ?? labels.errors.generic}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || rating === 0}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
