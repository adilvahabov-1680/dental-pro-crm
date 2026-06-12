import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getDict } from "@/lib/i18n";
import {
  listAppointments,
  toDateStr,
  weekStart,
  type AppointmentFilters as Filters,
} from "@/lib/appointments";
import { listClinicDoctors } from "@/lib/patients";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppointmentFilters } from "@/components/appointments/AppointmentFilters";
import { AppointmentsList } from "@/components/appointments/AppointmentsList";
import { CalendarDayView } from "@/components/appointments/CalendarDayView";
import { CalendarWeekView } from "@/components/appointments/CalendarWeekView";
import { cn } from "@/lib/utils";

type View = "day" | "week" | "list";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("appointments.view");
  const t = getDict(user.locale);
  const ta = t.appointments;
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const view: View = s("view") === "week" ? "week" : s("view") === "list" ? "list" : "day";
  const todayStr = toDateStr(new Date());
  const date = s("date") ?? todayStr;

  const filters: Filters = {
    date,
    doctorId: s("doctor"),
    q: s("q"),
    range: view === "list" ? "all" : view,
  };

  const canManage = hasPermission(user, "appointments.manage");
  const addTreatmentLabel = hasPermission(user, "treatments.manage")
    ? t.treatments.addFromAppointment
    : undefined;
  // фильтр по врачу — только для ролей, видящих всю клинику
  const showDoctorFilter = user.role !== "doctor" && user.role !== "assistant";

  const [items, doctors] = await Promise.all([
    listAppointments(user, filters),
    showDoctorFilter ? listClinicDoctors(user) : Promise.resolve([]),
  ]);

  const statusOptions = Object.entries(APPOINTMENT_STATUS_META).map(([value, m]) => ({
    value,
    label: m.az,
  }));
  const cardLabels = {
    min: ta.card.min,
    openPatient: ta.card.openPatient,
    chart: ta.card.chart,
    complaint: ta.card.complaint,
  };

  const tabHref = (v: View) => {
    const next = new URLSearchParams();
    if (v !== "day") next.set("view", v);
    if (date !== todayStr) next.set("date", date);
    if (filters.doctorId) next.set("doctor", filters.doctorId);
    if (filters.q) next.set("q", filters.q);
    const qs = next.toString();
    return `/appointments${qs ? `?${qs}` : ""}`;
  };

  // дни недели для week view
  const ws = weekStart(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });
  const buildDayHref = (dateStr: string) =>
    `/appointments?date=${dateStr}${filters.doctorId ? `&doctor=${filters.doctorId}` : ""}`;

  const tabs: Array<{ v: View; label: string }> = [
    { v: "day", label: ta.tabs.day },
    { v: "week", label: ta.tabs.week },
    { v: "list", label: ta.tabs.list },
  ];

  return (
    <>
      <PageHeader
        title={t.modules.appointments.title}
        description={t.modules.appointments.desc}
        actions={
          canManage ? (
            <Link
              href="/appointments/new"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-linear-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-bg-base shadow-[0_4px_16px_rgb(34_211_238/0.25)] transition-opacity hover:opacity-90"
            >
              <CalendarPlus className="size-4" /> {ta.new}
            </Link>
          ) : undefined
        }
      />

      {/* вкладки Gün / Həftə / Siyahı */}
      <div className="mb-4 flex w-fit items-center gap-1 rounded-[12px] border border-border-subtle bg-bg-surface/60 p-1">
        {tabs.map(({ v, label }) => (
          <Link
            key={v}
            href={tabHref(v)}
            className={cn(
              "rounded-[9px] px-3.5 py-1.5 text-sm transition-colors",
              view === v
                ? "bg-accent/15 font-medium text-accent"
                : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <AppointmentFilters
        doctors={doctors.map((d) => ({ id: d.id, name: d.user.fullName }))}
        showDoctorFilter={showDoctorFilter}
        todayStr={todayStr}
        labels={{ ...ta.filters }}
      />

      {view === "day" && (
        <CalendarDayView
          items={items}
          canManage={canManage}
          statusOptions={statusOptions}
          labels={cardLabels}
          empty={ta.empty}
          addTreatmentLabel={addTreatmentLabel}
        />
      )}
      {view === "week" && (
        <CalendarWeekView
          weekDays={weekDays}
          items={items}
          buildDayHref={buildDayHref}
          todayStr={todayStr}
        />
      )}
      {view === "list" && (
        <>
          <AppointmentsList
            items={items}
            canManage={canManage}
            statusOptions={statusOptions}
            labels={cardLabels}
            empty={ta.empty}
            showDate
            addTreatmentLabel={addTreatmentLabel}
          />
          {items.length > 0 && (
            <p className="mt-3 text-sm tabular-nums text-text-secondary">
              {items.length} {ta.total}
            </p>
          )}
        </>
      )}
    </>
  );
}
