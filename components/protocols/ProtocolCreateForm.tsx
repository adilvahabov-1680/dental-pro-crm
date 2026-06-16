"use client";

import { useActionState } from "react";
import { createProtocol } from "@/lib/actions/protocols";
import type { ProtocolFormState } from "@/lib/validation/protocols";

interface Labels {
  new: string;
  nameLabel: string;
  descLabel: string;
  create: string;
  creating: string;
  error: string;
}

export function ProtocolCreateForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<ProtocolFormState | undefined, FormData>(
    createProtocol,
    undefined,
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-[14px] border border-border-subtle bg-bg-surface p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {labels.nameLabel}
        </label>
        <input
          name="name"
          required
          maxLength={200}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder={labels.new}
        />
        {state?.fieldErrors?.name && (
          <p className="mt-1 text-xs text-error">{state.fieldErrors.name}</p>
        )}
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          {labels.descLabel}
        </label>
        <input
          name="description"
          maxLength={1000}
          className="h-9 w-full rounded-[10px] border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-9 shrink-0 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? labels.creating : labels.create}
      </button>
      {state?.error && (
        <p className="text-xs text-error sm:col-span-2">{labels.error}</p>
      )}
    </form>
  );
}
