"use server";

/**
 * Server action смены статуса/данных зуба.
 * Безопасность: requirePermission("dental_chart.manage") → scope пациента
 * (getPatientForUser) → принадлежность tooth_record пациенту → safeUpdateByTenant.
 * Каждое изменение пишется в tooth_history (append-only) и audit_logs.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ToothChangeType } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { tenantClient, safeUpdateByTenant } from "@/lib/tenant";
import { getPatientForUser } from "@/lib/patients";
import { toothUpdateSchema, type ToothFormState } from "@/lib/validation/dental-chart";

/** Статусы, при установке которых обновляется last_treated_at. */
const TREATMENT_STATUSES = new Set([
  "in_treatment",
  "completed",
  "implant",
  "extracted",
  "root_canal",
  "filling",
  "crown",
  "temporary_filling",
]);

export async function updateToothRecord(
  _prev: ToothFormState | undefined,
  formData: FormData,
): Promise<ToothFormState> {
  const user = await requirePermission("dental_chart.manage");
  if (!user.clinicId) redirect("/dashboard");

  const parsed = toothUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "generic" };
  const input = parsed.data;

  // scope: врач/ассистент не доберутся до чужого пациента
  const patient = await getPatientForUser(user, input.patientId);
  if (!patient) return { error: "notFound" };

  const db = tenantClient(user.clinicId);
  // зуб должен принадлежать именно этому пациенту (tenant-фильтр внутри db)
  const record = await db.toothRecord.findFirst({
    where: { id: input.toothRecordId, patientId: input.patientId, deletedAt: null },
  });
  if (!record) return { error: "notFound" };

  const statusChanged = record.status !== input.status;
  const diagnosisChanged = (record.diagnosis ?? null) !== input.diagnosis;
  const notesChanged = (record.doctorNotes ?? null) !== input.doctorNotes;
  const priorityChanged = record.priority !== input.priority;
  const hasProcedure = input.procedureDone !== null;

  if (!statusChanged && !diagnosisChanged && !notesChanged && !priorityChanged && !hasProcedure) {
    return { ok: true }; // нет изменений — историю не засоряем
  }

  const changeType: ToothChangeType = statusChanged
    ? "status_changed"
    : hasProcedure
      ? "procedure_added"
      : diagnosisChanged
        ? "diagnosis_changed"
        : "note_changed";

  const touchTreatedAt = hasProcedure || (statusChanged && TREATMENT_STATUSES.has(input.status));

  try {
    await safeUpdateByTenant(db.toothRecord, "ToothRecord", record.id, {
      status: input.status,
      priority: input.priority,
      diagnosis: input.diagnosis,
      doctorNotes: input.doctorNotes,
      updatedById: user.id,
      ...(user.role === "doctor" && user.doctorId ? { doctorId: user.doctorId } : {}),
      ...(touchTreatedAt ? { lastTreatedAt: new Date() } : {}),
    });

    // append-only история по зубу — никогда не обновляется и не удаляется
    await db.toothHistory.create({
      data: {
        patientId: input.patientId,
        toothRecordId: record.id,
        toothNumber: record.toothNumber,
        changeType,
        previousStatus: record.status,
        newStatus: input.status,
        diagnosis: input.diagnosis,
        procedureDone: input.procedureDone,
        doctorNote: input.doctorNotes,
        changedById: user.id,
        before: { status: record.status, priority: record.priority, diagnosis: record.diagnosis },
        after: { status: input.status, priority: input.priority, diagnosis: input.diagnosis },
      },
    } as never);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "update",
        entityType: "tooth_record",
        entityId: record.id,
        before: { status: record.status },
        after: { status: input.status, toothNumber: record.toothNumber },
      },
    } as never);
  } catch (e) {
    console.error("updateToothRecord failed:", e);
    return { error: "generic" };
  }

  revalidatePath(`/patients/${input.patientId}/dental-chart`);
  return { ok: true };
}
