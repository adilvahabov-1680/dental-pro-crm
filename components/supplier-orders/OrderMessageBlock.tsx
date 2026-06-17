"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { Dict } from "@/i18n/az";

export function OrderMessageBlock({
  message,
  dict,
}: {
  message: string;
  dict: Dict["supplierOrders"];
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{dict.message.title}</h3>
          <p className="text-xs text-text-secondary">{dict.message.desc}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-base px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary"
          data-e2e-marker="copy-message"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-success" />
              {dict.messageCopied}
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              {dict.copyMessage}
            </>
          )}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded-[10px] bg-bg-base/50 px-4 py-3 text-xs text-text-secondary font-mono leading-relaxed">
        {message}
      </pre>
    </div>
  );
}
