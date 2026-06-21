/**
 * Данные модуля Bildirişlər (server-only), v1: только in_app для сотрудников.
 * Видимость: личные notifications (userId = текущий) + tenant-level
 * (userId = null), если у пользователя есть право на модуль типа
 * (low_stock → inventory.view и т.д.). Пациентские каналы (sms/whatsapp/email)
 * в этот UI не попадают — это очередь отправки, не входящие сотрудника.
 */
import { Prisma } from "@prisma/client";
import { tenantClient } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import type { SessionUser } from "@/types/auth";
import type { PermissionKey } from "@/types/permissions";

/** Право, требуемое для tenant-level notification данного типа. */
const TYPE_PERMISSION: Record<string, PermissionKey> = {
  inventory_low_stock: "inventory.view",
  debt_reminder: "finance.view",
  appointment_reminder: "appointments.view",
  followup: "appointments.view",
  repeat_visit_reminder: "appointments.view",
  reschedule_offer: "appointments.view",
  treatment_pdf: "documents.view",
  custom: "notifications.view",
  feedback_received: "patients.view",
};

/** Типы tenant-level notifications, доступные пользователю. */
function visibleTenantTypes(user: SessionUser): string[] {
  return Object.entries(TYPE_PERMISSION)
    .filter(([, perm]) => hasPermission(user, perm))
    .map(([type]) => type);
}

/** where видимых in_app notifications пользователя (внутри tenantClient). */
export function notificationScopeWhere(user: SessionUser): Prisma.NotificationWhereInput {
  return {
    channel: "in_app",
    OR: [
      { userId: user.id },
      { userId: null, type: { in: visibleTenantTypes(user) as never } },
    ],
  };
}

export type NotificationRow = Prisma.NotificationGetPayload<{
  select: {
    id: true;
    type: true;
    body: true;
    status: true;
    createdAt: true;
    patientId: true;
    appointmentId: true;
  };
}>;

export async function listNotifications(user: SessionUser): Promise<NotificationRow[]> {
  if (!user.clinicId) return [];
  const db = tenantClient(user.clinicId);
  return db.notification.findMany({
    where: notificationScopeWhere(user),
    select: {
      id: true,
      type: true,
      body: true,
      status: true,
      createdAt: true,
      patientId: true,
      appointmentId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Непрочитанные = всё, что не read (pending/sent/delivered/failed). */
export async function unreadNotificationsCount(user: SessionUser): Promise<number> {
  if (!user.clinicId || !hasPermission(user, "notifications.view")) return 0;
  const db = tenantClient(user.clinicId);
  return db.notification.count({
    where: { AND: [notificationScopeWhere(user), { status: { not: "read" } }] },
  });
}
