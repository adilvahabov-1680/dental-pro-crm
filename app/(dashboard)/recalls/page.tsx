import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import { listRecallQueue } from "@/lib/recall-tasks";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecallQueuePanel } from "@/components/recalls/RecallQueuePanel";

export default async function RecallsPage() {
  const user = await requirePermission("treatments.view");
  const t = getDict(user.locale);
  const tr = t.treatments.recall;
  const canManage = hasPermission(user, "treatments.manage");

  const queue = await listRecallQueue(user);

  return (
    <>
      <PageHeader title={tr.queueTitle} description={tr.queueDesc} />
      <RecallQueuePanel
        queue={queue}
        canManage={canManage}
        labels={{
          title: tr.queueTitle,
          empty: tr.queueEmpty,
          overdue: tr.overdue,
          dueSoon: tr.dueSoon,
          noAutoSend: t.communications.reminders.noAutoSend,
          noAutoAppointment: tr.noAutoAppointment,
          whatsappAction: tr.whatsappAction,
          whatsappPrepared: t.communications.whatsapp.prepared,
          noPhone: t.communications.errors.noPhone,
          markScheduled: tr.markScheduled,
          markScheduledDone: tr.markScheduledDone,
          dismiss: tr.dismiss,
          dismissDone: tr.dismissDone,
        }}
        errors={t.communications.errors}
      />
    </>
  );
}
