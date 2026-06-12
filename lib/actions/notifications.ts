"use server";

/**
 * Server actions модуля Bildirişlər.
 * Отметка read — updateMany поверх notificationScopeWhere: чужое
 * (другой tenant или другой userId) уведомление в where не попадает,
 * поэтому отдельная проверка владения не нужна.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantClient } from "@/lib/tenant";
import { notificationScopeWhere } from "@/lib/notifications";

function revalidate() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const user = await requirePermission("notifications.view");
  if (!user.clinicId) redirect("/dashboard");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  const db = tenantClient(user.clinicId);
  await db.notification.updateMany({
    where: { AND: [{ id }, notificationScopeWhere(user)] },
    data: { status: "read" },
  });
  revalidate();
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requirePermission("notifications.view");
  if (!user.clinicId) redirect("/dashboard");

  const db = tenantClient(user.clinicId);
  await db.notification.updateMany({
    where: { AND: [notificationScopeWhere(user), { status: { not: "read" } }] },
    data: { status: "read" },
  });
  revalidate();
}
