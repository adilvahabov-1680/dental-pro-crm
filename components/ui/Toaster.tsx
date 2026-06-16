"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error";
interface ToastItem { id: number; type: ToastType; message: string; }
type ShowToast = (message: string, type?: ToastType) => void;

const ToastCtx = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback<ShowToast>((message, type = "success") => {
    const id = ++nextId.current;
    setList((prev) => [...prev.slice(-2), { id, type, message }]);
    setTimeout(() => setList((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {list.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex min-w-[240px] max-w-sm items-start gap-3 rounded-[12px] border px-4 py-3 shadow-xl ${
              t.type === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="flex-1 text-sm">{t.message}</span>
            <button
              type="button"
              onClick={() => setList((prev) => prev.filter((x) => x.id !== t.id))}
              className="mt-0.5 shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastCtx);
}
