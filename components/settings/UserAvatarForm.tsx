"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadOwnAvatar } from "@/lib/actions/profile";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import type { UserAvatarFormState } from "@/lib/validation/userAvatar";
import type { Dict } from "@/i18n/az";

export function UserAvatarForm({
  dict,
  user,
  avatarSrc,
}: {
  dict: Dict["settings"];
  /** Только id/fullName — raw avatarUrl (relative storage path) клиенту не передаём. */
  user: { id: string; fullName: string };
  /** Готовый URL /api/user-avatar/{id}?v=... либо null — вычисляется на сервере. */
  avatarSrc: string | null;
}) {
  const [state, formAction, pending] = useActionState<UserAvatarFormState | undefined, FormData>(
    uploadOwnAvatar,
    undefined,
  );
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const prevState = useRef<typeof state>(undefined);
  useEffect(() => {
    if (state === prevState.current) return;
    prevState.current = state;
    if (state?.saved) {
      toast(dict.avatar.saved, "success");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state, dict.avatar.saved, toast]);

  const f = dict.avatar;

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-bg-elevated">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt={user.fullName} className="size-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-text-secondary">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <form
          action={formAction}
          data-user-avatar-form
          className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            ref={fileRef}
            type="file"
            name="avatar"
            required
            accept="image/png,image/jpeg,image/webp"
            className="block flex-1 cursor-pointer rounded-[10px] border border-border-subtle bg-bg-base/60 text-sm text-text-secondary file:mr-3 file:h-9 file:cursor-pointer file:rounded-l-[10px] file:border-0 file:bg-bg-elevated file:px-3 file:text-sm file:text-text-primary"
          />
          <Button type="submit" disabled={pending}>
            {pending ? f.uploading : f.upload}
          </Button>
        </form>
      </div>

      <p className="mt-1.5 text-[11px] text-text-secondary/80">{f.hint}</p>

      {state?.error && (
        <p className="mt-2 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[state.error as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
    </div>
  );
}
