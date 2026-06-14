"use client";

import { useActionState, useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import type { CommunicationFormState } from "@/lib/validation/communications";

type CommAction = (
  prev: CommunicationFormState | undefined,
  formData: FormData,
) => Promise<CommunicationFormState>;

/**
 * Кнопка click-to-chat: вызывает server action, который готовит текст +
 * wa.me-ссылку и пишет лог (status=prepared). Ссылка открывается на клиенте
 * в новой вкладке — сервер ничего не отправляет автоматически.
 */
export function WhatsAppActionButton({
  action,
  hiddenName,
  hiddenValue,
  label,
  preparedLabel,
  noPhoneLabel,
  errors,
  hasPhone,
  small = false,
}: {
  action: CommAction;
  hiddenName: string;
  hiddenValue: string;
  label: string;
  preparedLabel: string;
  noPhoneLabel: string;
  errors: Record<string, string>;
  hasPhone: boolean;
  small?: boolean;
}) {
  const [state, formAction, pending] = useActionState<CommunicationFormState | undefined, FormData>(
    action,
    undefined,
  );
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (state?.waUrl && state.waUrl !== openedRef.current) {
      openedRef.current = state.waUrl;
      window.open(state.waUrl, "_blank", "noopener");
    }
  }, [state?.waUrl]);

  const baseClass = small
    ? "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border border-success/30 bg-success/10 px-3 text-xs text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-success/30 bg-success/10 px-4 text-sm text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50";

  if (!hasPhone) {
    return (
      <button type="button" disabled className={baseClass} title={noPhoneLabel}>
        <MessageCircle className={small ? "size-3.5" : "size-4"} /> {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <button type="submit" disabled={pending} className={baseClass}>
        <MessageCircle className={small ? "size-3.5" : "size-4"} /> {label}
      </button>
      {state?.success && state.waUrl && (
        <span className="text-[11px] text-success">{preparedLabel}</span>
      )}
      {state?.error && (
        <span className="text-[11px] text-danger">{errors[state.error] ?? errors.generic}</span>
      )}
    </form>
  );
}
