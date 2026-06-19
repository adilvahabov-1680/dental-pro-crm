import {
  CalendarDays,
  Users,
  Stethoscope,
  PackageOpen,
  Wallet,
  CalendarCheck,
} from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";
import {
  dashboardSummary,
  listTodayAppointments,
  listOpenInvoices,
  listRecentActivity,
} from "@/lib/dashboard";
import { listLowStockItems } from "@/lib/inventory";
import { listReminderCandidates } from "@/lib/communications";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { TodayAppointmentsPanel } from "@/components/dashboard/TodayAppointmentsPanel";
import { FinanceOverviewPanel } from "@/components/dashboard/FinanceOverviewPanel";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import { LowStockPanel } from "@/components/inventory/LowStockPanel";
import { TodayRemindersPanel } from "@/components/dashboard/TodayRemindersPanel";

export default async function DashboardPage() {
  const user = await requireAuth();
  const t = getDict(user.locale);
  const d = t.dashboard;

  const [summary, todayAppts, openInvoices, lowStockItems, activity, reminderQueue] =
    await Promise.all([
      dashboardSummary(user),
      listTodayAppointments(user),
      listOpenInvoices(user),
      hasPermission(user, "inventory.view") ? listLowStockItems(user) : Promise.resolve([]),
      listRecentActivity(user),
      listReminderCandidates(user),
    ]);

  const fmtTime = (dt: Date) =>
    new Date(dt).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });

  // карточки собираются только из доступных модулей (null = нет permission)
  const cards: Array<React.ComponentProps<typeof StatCard>> = [];
  if (summary.todayAppointments) {
    cards.push({
      title: d.cards.todayAppointments,
      value: String(summary.todayAppointments.count),
      hint: summary.todayAppointments.nextAt
        ? `${d.hints.nextAppointment}: ${fmtTime(summary.todayAppointments.nextAt)}`
        : undefined,
      icon: CalendarDays,
      tone: "accent",
    });
  }
  if (summary.doneTreatmentsMonth) {
    cards.push({
      title: d.cards.doneTreatments,
      value: String(summary.doneTreatmentsMonth.count),
      hint: `${d.hints.thisMonth} · ${formatMoney(summary.doneTreatmentsMonth.amount)}`,
      icon: Stethoscope,
      tone: "success",
    });
  }
  if (summary.pendingPayments) {
    cards.push({
      title: d.cards.pendingPayments,
      value: formatMoney(summary.pendingPayments.debt),
      hint:
        summary.pendingPayments.invoices > 0
          ? `${summary.pendingPayments.invoices} ${d.hints.openInvoices}`
          : d.hints.noDebt,
      icon: Wallet,
      tone: summary.pendingPayments.debt > 0 ? "danger" : "success",
    });
  }
  if (summary.lowStock) {
    cards.push({
      title: d.cards.lowStock,
      value: String(summary.lowStock.low + summary.lowStock.out),
      hint:
        summary.lowStock.low + summary.lowStock.out > 0
          ? d.hints.lowAndOut
          : d.hints.allStocked,
      icon: PackageOpen,
      tone: summary.lowStock.out > 0 ? "danger" : summary.lowStock.low > 0 ? "warning" : "success",
    });
  }
  if (summary.newPatientsMonth !== null) {
    cards.push({
      title: d.cards.newPatients,
      value: String(summary.newPatientsMonth),
      hint: d.hints.thisMonth,
      icon: Users,
      tone: "info",
    });
  }
  if (summary.monthPayments !== null) {
    cards.push({
      title: d.cards.monthPayments,
      value: formatMoney(summary.monthPayments),
      hint: d.hints.thisMonth,
      icon: CalendarCheck,
      tone: "accent",
    });
  }

  const showAppointments = hasPermission(user, "appointments.view");
  const showFinance = hasPermission(user, "finance.view");
  const showInventory = hasPermission(user, "inventory.view");
  // audit-панель — только общеклиничные роли (см. listRecentActivity)
  const showActivity =
    !!user.clinicId && user.role !== "doctor" && user.role !== "assistant";

  return (
    <>
      <PageHeader title={`${d.welcome}, ${user.fullName}`} description={d.overview} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <StatCard key={c.title} {...c} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {showAppointments && (
          <TodayAppointmentsPanel
            appointments={todayAppts}
            labels={{
              title: d.panels.today,
              empty: d.panels.todayEmpty,
              all: d.panels.allAppointments,
            }}
          />
        )}
        {showFinance && (
          <FinanceOverviewPanel
            invoices={openInvoices}
            labels={{
              title: d.panels.finance,
              empty: d.panels.financeEmpty,
              all: d.panels.allFinance,
              balance: t.finance.invoice.balance,
            }}
          />
        )}
        {showInventory && (
          <LowStockPanel
            items={lowStockItems}
            labels={{
              title: t.inventory.lowStock.title,
              empty: t.inventory.lowStock.empty,
              minQuantity: t.inventory.item.minQuantity,
            }}
          />
        )}
        {showActivity && (
          <RecentActivityPanel
            rows={activity}
            labels={{
              title: d.panels.activity,
              empty: d.panels.activityEmpty,
              entities: d.activity.entities,
              actions: d.activity.actions,
            }}
          />
        )}
        {showAppointments && (
          <TodayRemindersPanel
            queue={reminderQueue}
            labels={{
              title: t.communications.reminders.title,
              empty: t.communications.reminders.empty,
              windowLabel: t.communications.reminders.windowLabel,
              noAutoSend: t.communications.reminders.noAutoSend,
              notDue: t.communications.reminders.notDue,
              groups: t.communications.reminders.groups,
              badges: t.communications.reminders.badges,
              action: t.communications.reminders.action,
              prepared: t.communications.whatsapp.prepared,
              noPhone: t.communications.errors.noPhone,
            }}
            errors={t.communications.errors}
          />
        )}
      </div>
    </>
  );
}
