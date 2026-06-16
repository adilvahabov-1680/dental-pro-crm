/**
 * Данные модуля Treatment Protocols (server-only).
 * Протоколы — шаблоны лечения клиники (не пациентские данные).
 * Tenant-изоляция: все запросы через tenantClient.
 */
import { tenantClient } from "@/lib/tenant";
import { NON_BLOCKING_STATUSES } from "@/lib/appointments";
import { getWorkingHours } from "@/lib/settings";
import type { SessionUser } from "@/types/auth";
import type { WorkingHours, WeekDay } from "@/lib/validation/settings";

const stepInclude = {
  service: { select: { id: true, name: true, durationMin: true } },
} as const;

export type ProtocolWithSteps = {
  id: string;
  clinicId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  steps: {
    id: string;
    orderIndex: number;
    durationMin: number | null;
    intervalDays: number | null;
    notes: string | null;
    service: { id: string; name: string; durationMin: number | null };
  }[];
};

export async function listProtocols(user: SessionUser): Promise<ProtocolWithSteps[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentProtocol.findMany({
    where: { deletedAt: null },
    include: {
      steps: {
        where: { deletedAt: null },
        include: stepInclude,
        orderBy: { orderIndex: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows as unknown as ProtocolWithSteps[];
}

export async function listActiveProtocols(user: SessionUser): Promise<ProtocolWithSteps[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  const rows = await db.treatmentProtocol.findMany({
    where: { deletedAt: null, isActive: true },
    include: {
      steps: {
        where: { deletedAt: null },
        include: stepInclude,
        orderBy: { orderIndex: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows as unknown as ProtocolWithSteps[];
}

export async function getProtocolForClinic(
  user: SessionUser,
  protocolId: string,
): Promise<ProtocolWithSteps | null> {
  if (!user.clinicId) return null;
  const db = tenantClient(user.clinicId);
  const row = await db.treatmentProtocol.findFirst({
    where: { id: protocolId, deletedAt: null },
    include: {
      steps: {
        where: { deletedAt: null },
        include: stepInclude,
        orderBy: { orderIndex: "asc" },
      },
    },
  });
  return row as unknown as ProtocolWithSteps | null;
}

// ─────────────── Slot-finding helper ───────────────

const DAY_MAP: Record<number, WeekDay> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

/** "09:00" → minutes since midnight */
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Combine date + "HH:MM" into a Date (server local time). */
function makeDateTime(date: Date, timeStr: string): Date {
  const d = new Date(date);
  const [h, m] = timeStr.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export interface SlotSuggestion {
  date: string; // "yyyy-mm-dd"
  time: string; // "HH:MM"
  endsAt: string; // "HH:MM"
}

/**
 * Suggest up to `maxSlots` free appointment slots for a doctor.
 * Searches forward from `fromDate` within `searchDays` days.
 * Uses clinic working hours (fallback: Mon-Fri 09:00-18:00) and
 * checks existing appointments for overlap.
 *
 * Security: clinicId comes from session, doctorId is verified by caller.
 */
export async function findAvailableAppointmentSlots(
  user: SessionUser,
  doctorId: string,
  fromDate: Date,
  durationMin: number,
  opts: { searchDays?: number; maxSlots?: number } = {},
): Promise<SlotSuggestion[]> {
  if (!user.clinicId) return [];
  const { searchDays = 14, maxSlots = 5 } = opts;

  const hours = await getWorkingHours(user);
  const db = tenantClient(user.clinicId);

  // Pre-load all appointments in the search window for this doctor.
  const windowEnd = new Date(fromDate);
  windowEnd.setDate(windowEnd.getDate() + searchDays);

  const busySlots = await db.appointment.findMany({
    where: {
      doctorId,
      deletedAt: null,
      status: { notIn: [...NON_BLOCKING_STATUSES] },
      startsAt: { gte: fromDate, lt: windowEnd },
    },
    select: { startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });

  const slots: SlotSuggestion[] = [];
  const slotMs = durationMin * 60_000;

  for (let offset = 0; offset < searchDays && slots.length < maxSlots; offset++) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + offset);
    const weekDay = DAY_MAP[day.getDay()];
    const wh = (hours as WorkingHours)[weekDay];
    if (!wh) continue; // clinic closed

    const dayFrom = timeToMin(wh.from);
    const dayTo = timeToMin(wh.to);

    // Walk in 15-minute increments through the working day.
    for (let cur = dayFrom; cur + durationMin <= dayTo; cur += 15) {
      const hh = String(Math.floor(cur / 60)).padStart(2, "0");
      const mm = String(cur % 60).padStart(2, "0");
      const slotStart = makeDateTime(day, `${hh}:${mm}`);
      const slotEnd = new Date(slotStart.getTime() + slotMs);

      // Skip past times on the start day.
      if (slotStart <= new Date()) continue;

      const overlaps = busySlots.some(
        (b) => b.startsAt < slotEnd && b.endsAt > slotStart,
      );
      if (!overlaps) {
        const endH = String(Math.floor((cur + durationMin) / 60)).padStart(2, "0");
        const endM = String((cur + durationMin) % 60).padStart(2, "0");
        slots.push({
          date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
          time: `${hh}:${mm}`,
          endsAt: `${endH}:${endM}`,
        });
        if (slots.length >= maxSlots) break;
      }
    }
  }

  return slots;
}
