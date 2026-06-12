# Dashboard — Live icmal

Сессия 11. Все demo-цифры заменены реальными данными из БД в scope пользователя.

## Источники данных

`lib/dashboard.ts` (server-only). Permission-гейтинг выполняется в данных:
блок без `<module>.view` возвращает `null` / `[]`, UI не рендерит карточку.

### Summary cards (`dashboardSummary`)

| Карточка | Источник | Permission | Scope |
| --- | --- | --- | --- |
| Bugünkü qəbullar | `appointments` за сегодня, без cancelled/no_show; hint — время ближайшего | `appointments.view` | `appointmentScopeWhere` (doctor — свои, assistant — прикреплённый врач) |
| Tamamlanan müalicələr | `treatment_items` status=done, `performedAt` ≥ начала месяца; hint — сумма | `treatments.view` | `patientScopeWhere` |
| Ödəniş gözəyənlər | Σ `debts` open/partial + count | `finance.view` | `patientScopeWhere` |
| Az qalan materiallar | `inventory_items` quantity ≤ minQuantity (low + out) | `inventory.view` | вся клиника (склад общий) |
| Yeni pasiyentlər | `patients` createdAt ≥ начала месяца | `patients.view` | `patientScopeWhere` |
| Bu ay ödənişlər | Σ `payments` paidAt ≥ начала месяца | `finance.view` | `patientScopeWhere` |

### Панели

- **TodayAppointmentsPanel** — приёмы сегодняшнего дня (время, пациент, врач,
  статус, ссылка на пациента), `listTodayAppointments`, до 8.
- **FinanceOverviewPanel** — счета issued/partially_paid (№, пациент, остаток,
  статус, ссылка на счёт), `listOpenInvoices`, до 6.
- **LowStockPanel** — переиспользован из модуля Anbar (`listLowStockItems`).
- **RecentActivityPanel** — последние 8 записей `audit_log`. Показывается
  ТОЛЬКО общеклиничным ролям (owner/admin/reception/accountant): лог не
  фильтруется по пациентскому scope, врачу/ассистенту его показывать нельзя.

## Tenant / scope

Все запросы — через `tenantClient(clinicId)`; чужие клиники не видны.
doctor видит свои приёмы и пациентов (учитывая `doctor_sees_all_patients`),
assistant — данные прикреплённого врача, без finance/inventory карточек
(нет `.view` по умолчанию).

## E2E

`npx tsx scripts/e2e-dashboard-check.ts` — сверяет цифры карточек с БД,
проверяет scope врача/ассистента, изоляцию чужого тенанта и отсутствие
demo-заглушек.
