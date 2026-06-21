import type { SessionUser } from "@/types/auth";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";

export const APP_NAME = "Dental Pro CRM";

/** AZ-метки и цветовые токены статусов зуба (enum ToothStatus, 13). */
export const TOOTH_STATUS_META: Record<string, { az: string; color: string }> = {
  healthy: { az: "Sağlam", color: "text-secondary" },
  needs_treatment: { az: "Müalicə tələb edir", color: "warning" },
  in_treatment: { az: "Müalicə olunur", color: "accent" },
  completed: { az: "Tamamlandı", color: "success" },
  implant: { az: "İmplant", color: "info" },
  extracted: { az: "Çıxarılıb", color: "text-secondary" },
  root_canal: { az: "Kanal müalicəsi", color: "info" },
  filling: { az: "Plomba", color: "accent-deep" },
  crown: { az: "Tac / Koronka", color: "warning" },
  observation: { az: "Müşahidə", color: "secondary" },
  temporary_filling: { az: "Müvəqqəti plomba", color: "warning" },
  crown_needed: { az: "Tac lazımdır", color: "warning" },
  extraction_planned: { az: "Çıxarılma planlaşdırılıb", color: "danger" },
};

/** AZ-метки статусов приёма (enum AppointmentStatus, 11). */
export const APPOINTMENT_STATUS_META: Record<string, { az: string; color: string }> = {
  scheduled: { az: "Yaradıldı", color: "secondary" },
  notified: { az: "Bildiriş göndərildi", color: "info" },
  confirmed: { az: "Təsdiqləndi", color: "accent" },
  arrived: { az: "Gəldi", color: "accent" },
  in_progress: { az: "Qəbuldadır", color: "accent" },
  running_late: { az: "Gecikir", color: "warning" },
  reschedule_requested: { az: "Vaxt dəyişmə sorğusu", color: "warning" },
  completed: { az: "Tamamlandı", color: "success" },
  no_show: { az: "Gəlmədi", color: "danger" },
  cancelled: { az: "Ləğv edildi", color: "text-secondary" },
  late_cancelled: { az: "Təcili ləğv", color: "danger" },
};

/** AZ-метки статусов процедуры (enum ItemStatus). */
export const TREATMENT_ITEM_STATUS_META: Record<string, { az: string; color: string }> = {
  planned: { az: "Planlaşdırılıb", color: "secondary" },
  in_progress: { az: "Davam edir", color: "accent" },
  done: { az: "Tamamlandı", color: "success" },
  cancelled: { az: "Ləğv edilib", color: "text-secondary" },
};

/** AZ-метки статусов плана лечения (enum PlanStatus). */
export const TREATMENT_PLAN_STATUS_META: Record<string, { az: string; color: string }> = {
  draft: { az: "Qaralama", color: "text-secondary" },
  proposed: { az: "Təklif edilib", color: "info" },
  approved: { az: "Təsdiqlənib", color: "secondary" },
  in_progress: { az: "Davam edir", color: "accent" },
  completed: { az: "Tamamlandı", color: "success" },
  cancelled: { az: "Ləğv edilib", color: "text-secondary" },
};

/** AZ-метки статусов счёта (enum InvoiceStatus). */
export const INVOICE_STATUS_META: Record<string, { az: string; color: string }> = {
  draft: { az: "Qaralama", color: "text-secondary" },
  issued: { az: "Ödəniş gözləyir", color: "warning" },
  partially_paid: { az: "Qismən ödənilib", color: "accent" },
  paid: { az: "Ödənilib", color: "success" },
  cancelled: { az: "Ləğv edilib", color: "text-secondary" },
};

/** AZ-метки способов оплаты (enum PaymentMethod). */
export const PAYMENT_METHOD_META: Record<string, { az: string }> = {
  cash: { az: "Nağd" },
  card: { az: "Kart" },
  transfer: { az: "Bank köçürməsi" },
  installment: { az: "Hissə-hissə" },
  other: { az: "Digər" },
};

/** Отображаемый номер счёта из per-clinic последовательности. */
export function formatInvoiceNumber(number: number): string {
  return `INV-${String(number).padStart(6, "0")}`;
}

/** AZ-метки типов PDF-документов (enum PdfType). */
export const PDF_TYPE_META: Record<string, { az: string; color: string }> = {
  invoice_pdf: { az: "Hesab sənədi", color: "accent" },
  treatment_plan_pdf: { az: "Müalicə planı", color: "info" },
  tooth_chart_pdf: { az: "Diş xəritəsi", color: "info" },
  consent_form: { az: "Razılıq forması", color: "secondary" },
  extract: { az: "Müalicə çıxarışı", color: "success" },
  work_act: { az: "Görülən işlər aktı", color: "secondary" },
  recommendations: { az: "Tövsiyələr", color: "secondary" },
};

/** AZ-метки типов загружаемых файлов пациента (enum DocumentType). */
export const DOCUMENT_TYPE_META: Record<string, { az: string; color: string }> = {
  xray: { az: "Rentgen şəkli", color: "info" },
  consent: { az: "Razılıq sənədi", color: "secondary" },
  photo: { az: "Foto / şəkil", color: "accent" },
  contract: { az: "Müqavilə", color: "warning" },
  other: { az: "Digər sənəd", color: "text-secondary" },
};

/** AZ-метки каналов коммуникации с пациентом (сессия 15). */
export const COMMUNICATION_CHANNEL_META: Record<string, { az: string; color: string }> = {
  whatsapp: { az: "WhatsApp", color: "success" },
  sms: { az: "SMS", color: "info" },
  phone: { az: "Telefon", color: "secondary" },
  other: { az: "Digər", color: "text-secondary" },
};

/** AZ-метки типов записей коммуникации с пациентом (сессия 15). */
export const COMMUNICATION_TYPE_META: Record<string, { az: string; color: string }> = {
  appointment_reminder: { az: "Qəbul xatırlatması", color: "accent" },
  document_message: { az: "Sənəd mesajı", color: "info" },
  payment_reminder: { az: "Ödəniş xatırlatması", color: "warning" },
  manual_note: { az: "Qeyd", color: "text-secondary" },
  reschedule_offer: { az: "Vaxt variantı təklifi", color: "info" },
  repeat_visit_reminder: { az: "Kontrol xatırlatması", color: "info" },
  feedback_received: { az: "Rəy", color: "accent" },
};

/** AZ-метки статусов recall-задачи (enum RecallStatus, сессия 44). */
export const RECALL_STATUS_META: Record<string, { az: string; color: string }> = {
  pending: { az: "Gözləyir", color: "secondary" },
  prepared: { az: "Hazırlanıb", color: "success" },
  scheduled: { az: "Planlaşdırılıb", color: "accent" },
  dismissed: { az: "Bağlanıb", color: "text-secondary" },
};

/**
 * Отображаемый номер PDF-документа. Косметический (в pdf_records не хранится):
 * считается как count+1 на момент генерации, без lock — для демонстрационного
 * номера в шапке PDF этого достаточно.
 */
export function formatDocumentNumber(number: number): string {
  return `SND-${String(number).padStart(6, "0")}`;
}

/** AZ-метки статусов материала (вычисляются из quantity/minQuantity/expiresAt). */
export const INVENTORY_STATUS_META: Record<string, { az: string; color: string }> = {
  normal: { az: "Normal", color: "success" },
  low: { az: "Az qalır", color: "warning" },
  out: { az: "Bitib", color: "danger" },
  expiring: { az: "Vaxtı yaxınlaşır", color: "warning" },
};

/** AZ-метки типов движений склада (enum MovementType). */
export const MOVEMENT_TYPE_META: Record<string, { az: string; sign: 1 | -1 }> = {
  in_stock: { az: "Mədaxil", sign: 1 },
  out_stock: { az: "Məxaric", sign: -1 },
  adjustment: { az: "Düzəliş (artırma)", sign: 1 },
  adjustment_out: { az: "Düzəliş (azalma)", sign: -1 },
  write_off: { az: "Silinmə / xarab / itki", sign: -1 },
  treatment_usage: { az: "Müalicə sərfiyyatı", sign: -1 },
  treatment_usage_reversal: { az: "Sərfiyyat geri qaytarma", sign: 1 },
  supplier_receiving: { az: "Tədarükçüdən qəbul", sign: 1 },
};

// ─────────────────────────────────────────────────────────────
// ВРЕМЕННО (AUTH_MOCK=true): demo-пользователи для входа без БД.
// Удалить вместе с mock-веткой в lib/actions/auth.ts, когда
// PostgreSQL поднята, миграции применены и seed выполнен.
// Пароль один для всех: DEMO_PASSWORD.
// ─────────────────────────────────────────────────────────────
export const DEMO_PASSWORD = "Demo1234!";

const DEMO_CLINIC_ID = "00000000-0000-4000-8000-00000000c11n";

type DemoUser = Omit<SessionUser, "permissions">;

export const DEMO_USERS: DemoUser[] = [
  {
    id: "00000000-0000-4000-8000-0000000000sa",
    clinicId: null,
    role: "super_admin",
    doctorId: null,
    assignedDoctorId: null,
    fullName: "Super Admin",
    email: "superadmin@dentalpro.az",
    locale: "az",
  },
  {
    id: "00000000-0000-4000-8000-0000000000ad",
    clinicId: DEMO_CLINIC_ID,
    role: "owner",
    doctorId: null,
    assignedDoctorId: null,
    fullName: "Aysel Məmmədova",
    email: "admin@demo.dentalpro.az",
    locale: "az",
  },
  {
    id: "00000000-0000-4000-8000-0000000000dr",
    clinicId: DEMO_CLINIC_ID,
    role: "doctor",
    doctorId: "00000000-0000-4000-8000-00000000d0c1",
    assignedDoctorId: null,
    fullName: "Dr. Elvin Quliyev",
    email: "hekim@demo.dentalpro.az",
    locale: "az",
  },
  {
    id: "00000000-0000-4000-8000-0000000000as",
    clinicId: DEMO_CLINIC_ID,
    role: "assistant",
    doctorId: null,
    assignedDoctorId: "00000000-0000-4000-8000-00000000d0c1",
    fullName: "Nigar Əliyeva",
    email: "assistent@demo.dentalpro.az",
    locale: "az",
  },
];

export function buildDemoSessionUser(demo: DemoUser): SessionUser {
  return { ...demo, permissions: DEFAULT_ROLE_PERMISSIONS[demo.role] };
}
