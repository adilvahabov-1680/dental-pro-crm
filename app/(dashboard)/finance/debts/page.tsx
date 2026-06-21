import Link from "next/link";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listDebtReminderCandidates } from "@/lib/finance";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DebtReminderRow } from "@/components/finance/DebtReminderRow";

export default async function DebtRemindersPage() {
  const user = await requirePermission("finance.view");
  const t = getDict(user.locale);
  const td = t.finance.debts;

  const canManage = hasPermission(user, "finance.manage");
  const candidates = await listDebtReminderCandidates(user);

  return (
    <>
      <PageHeader
        title={td.title}
        description={td.desc}
        actions={
          <Link
            href="/finance"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border-subtle bg-bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <ArrowLeft className="size-4" /> {t.modules.finance.title}
          </Link>
        }
      />

      {candidates.length === 0 ? (
        <Card>
          <EmptyState icon={CircleCheck} title={td.empty.title} description={td.empty.desc} />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-xs text-text-secondary">{td.noAutoSend}</p>
          <div className="space-y-2">
            {candidates.map((c) => (
              <DebtReminderRow
                key={c.id}
                candidate={c}
                canManage={canManage}
                labels={{
                  paid: td.paid,
                  remaining: td.remaining,
                  dueDate: td.dueDate,
                  lastReminder: td.lastReminder,
                  neverReminded: td.neverReminded,
                  action: td.action,
                  preparedLabel: t.communications.whatsapp.prepared,
                  noPhone: td.noPhone,
                }}
                errors={t.communications.errors}
              />
            ))}
          </div>
          <p className="mt-3 text-sm tabular-nums text-text-secondary">
            {candidates.length} {td.total}
          </p>
        </>
      )}
    </>
  );
}
