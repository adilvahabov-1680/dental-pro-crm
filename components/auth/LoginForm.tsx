"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { LoginState } from "@/types/auth";

export function LoginForm({
  labels,
}: {
  labels: {
    email: string;
    password: string;
    submit: string;
    submitting: string;
    error: string;
    clinicSuspended: string;
  };
}) {
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <Input
        id="email"
        name="email"
        type="text"
        label={labels.email}
        placeholder="hekim@klinika.az"
        autoComplete="username"
        required
      />
      <Input
        id="password"
        name="password"
        type="password"
        label={labels.password}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      {state?.error && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error === "clinicSuspended" ? labels.clinicSuspended : labels.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
