"use client";

import { useActionState } from "react";
import { Send, PackageCheck, X, CheckCircle2 } from "lucide-react";
import {
  confirmSupplierOrderDraftAction,
  markSupplierOrderSent,
  markSupplierOrderReceived,
  cancelSupplierOrder,
} from "@/lib/actions/supplier-orders";
import { Button } from "@/components/ui/Button";
import type { SupplierOrderFull } from "@/lib/supplier-orders";
import type { SupplierOrderActionState } from "@/lib/validation/supplier-orders";
import type { Dict } from "@/i18n/az";

export function OrderStatusActions({
  order,
  dict,
}: {
  order: SupplierOrderFull;
  dict: Dict["supplierOrders"];
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState<
    SupplierOrderActionState | undefined,
    FormData
  >(confirmSupplierOrderDraftAction, undefined);
  const [sentState, sentAction, sentPending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    markSupplierOrderSent,
    undefined,
  );
  const [recvState, recvAction, recvPending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    markSupplierOrderReceived,
    undefined,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState<SupplierOrderActionState | undefined, FormData>(
    cancelSupplierOrder,
    undefined,
  );

  const errorState = confirmState?.error || sentState?.error || recvState?.error || cancelState?.error;

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-surface/80 p-5 space-y-3">
      {order.status === "draft" && (
        <>
          <form action={confirmAction} data-e2e-marker="confirm-draft">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={confirmPending} className="w-full justify-center">
              <CheckCircle2 className="size-4" />
              {confirmPending ? dict.approval.confirming : dict.approval.confirmDraft}
            </Button>
          </form>
          {confirmState?.success && (
            <p
              className="rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
              data-e2e-marker="confirm-success"
            >
              {dict.approval.confirmSuccess}
            </p>
          )}
          <p className="text-center text-xs text-text-secondary">{dict.approval.autoSendNote}</p>
          <form action={sentAction} data-e2e-marker="mark-sent">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={sentPending} variant="secondary" className="w-full justify-center">
              <Send className="size-4" />
              {sentPending ? dict.markingsSent : dict.markSent}
            </Button>
          </form>
          <form action={cancelAction} data-e2e-marker="cancel-order">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={cancelPending} variant="secondary" className="w-full justify-center">
              <X className="size-4" />
              {cancelPending ? dict.cancellingOrder : dict.cancelOrder}
            </Button>
          </form>
        </>
      )}

      {order.status === "approved" && (
        <>
          <form action={sentAction} data-e2e-marker="mark-sent">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={sentPending} className="w-full justify-center">
              <Send className="size-4" />
              {sentPending ? dict.markingsSent : dict.markSent}
            </Button>
          </form>
          <form action={cancelAction} data-e2e-marker="cancel-order">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={cancelPending} variant="secondary" className="w-full justify-center">
              <X className="size-4" />
              {cancelPending ? dict.cancellingOrder : dict.cancelOrder}
            </Button>
          </form>
        </>
      )}

      {order.status === "sent" && (
        <>
          <form action={recvAction} data-e2e-marker="mark-received">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={recvPending} className="w-full justify-center">
              <PackageCheck className="size-4" />
              {recvPending ? dict.markingReceived : dict.markReceived}
            </Button>
          </form>
          <form action={cancelAction} data-e2e-marker="cancel-order">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={cancelPending} variant="secondary" className="w-full justify-center">
              <X className="size-4" />
              {cancelPending ? dict.cancellingOrder : dict.cancelOrder}
            </Button>
          </form>
        </>
      )}

      {errorState && (
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {dict.errors[errorState as keyof typeof dict.errors] ?? dict.errors.generic}
        </p>
      )}
    </div>
  );
}
