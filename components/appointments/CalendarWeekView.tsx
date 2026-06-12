import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { toDateStr, type AppointmentListItem } from "@/lib/appointments";
import { cn } from "@/lib/utils";

function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
}

const DOT: Record<string, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  secondary: "bg-secondary",
  "text-secondary": "bg-text-secondary/50",
};

/** Неделя: 7 колонок с чипами приёмов; клик по дню → дневной вид. */
export function CalendarWeekView({
  weekDays,
  items,
  buildDayHref,
  todayStr,
}: {
  weekDays: Date[];
  items: AppointmentListItem[];
  buildDayHref: (dateStr: string) => string;
  todayStr: string;
}) {
  const byDay = new Map<string, AppointmentListItem[]>();
  for (const a of items) {
    const key = toDateStr(new Date(a.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {weekDays.map((day) => {
        const key = toDateStr(day);
        const dayItems = byDay.get(key) ?? [];
        const isToday = key === todayStr;
        return (
          <Card
            key={key}
            className={cn("flex min-h-32 flex-col p-2.5", isToday && "border-accent/40")}
          >
            <Link
              href={buildDayHref(key)}
              className={cn(
                "mb-2 flex items-baseline justify-between gap-1 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-bg-elevated",
                isToday ? "text-accent" : "text-text-primary",
              )}
            >
              <span className="text-xs font-semibold capitalize">
                {day.toLocaleDateString("az-AZ", { weekday: "short" })}
              </span>
              <span className="text-xs tabular-nums text-text-secondary">
                {day.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit" })}
              </span>
            </Link>
            <div className="space-y-1">
              {dayItems.slice(0, 5).map((a) => (
                <Link
                  key={a.id}
                  href={buildDayHref(key)}
                  className="flex items-center gap-1.5 rounded-[8px] bg-bg-elevated/60 px-1.5 py-1 text-[11px] transition-colors hover:bg-bg-elevated"
                  title={`${a.patient.lastName} ${a.patient.firstName}`}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      DOT[APPOINTMENT_STATUS_META[a.status]?.color ?? ""] ?? "bg-text-secondary/50",
                    )}
                  />
                  <span className="tabular-nums text-text-secondary">{fmtTime(a.startsAt)}</span>
                  <span className="truncate text-text-primary">{a.patient.lastName}</span>
                </Link>
              ))}
              {dayItems.length > 5 && (
                <p className="px-1.5 text-[11px] text-text-secondary">+{dayItems.length - 5}</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
