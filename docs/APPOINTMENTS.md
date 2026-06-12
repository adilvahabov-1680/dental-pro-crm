# Dental Pro CRM — Модуль Qəbullar (Appointments)
**by AV Systems** · v1.0 · Сессия 7
Связанные документы: [DATABASE.md](DATABASE.md) §B · [PATIENTS.md](PATIENTS.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Routes

| Маршрут | Содержимое |
|---|---|
| `/appointments` | вкладки **Gün** (таймлайн по часам) / **Həftə** (7 колонок-чипов) / **Siyahı** (последние 50); фильтры: дата, врач (только для ролей с обзором клиники), поиск пациента (debounce) |
| `/appointments/new` | форма создания; `?patient=<id>` — преселект пациента (кнопка «Yeni qəbul» с карточки пациента). Вложенный route не делался — одна форма без дублирования |
| `/patients/[id]` | живой блок «Qəbullar»: счётчик, ближайший приём, последние 3, ссылка «Bütün qəbullar» |

Карточка приёма: время + длительность (вычисляется из startsAt/endsAt), пациент (ссылка), телефон, врач, причина (complaint), статус, быстрые действия: смена статуса (select+OK при manage), переход на diş xəritəsi пациента.

## Permissions / Tenant

- Каталог не менялся: `appointments.view` / `appointments.manage` существовали с сессии 3 (doctor и reception — view+manage, assistant — только view, owner/admin — всё).
- Scope: **doctor** — только свои приёмы (`doctorId`); **assistant** — приёмы прикреплённого врача; остальные — клиника. Реализация: `appointmentScopeWhere()` поверх `tenantClient`.
- `createAppointment` не доверяет form input: пациент — через `getPatientForUser` (чужой patientId → ошибка без утечки), врач для роли doctor — всегда свой, для assistant — прикреплённый; для admin/owner валидируется принадлежность врача клинике. Чужой/несуществующий doctorId → ошибка.
- `updateAppointmentStatus`: приём ищется в scope (`getAppointmentForUser`), запись — `safeUpdateByTenant`. Assistant (view без manage) видит бейдж вместо контрола, его POST отклоняется сервером.
- Audit: create и смена статуса пишутся в `audit_logs`.

## Status logic

Используется существующий enum (11): `scheduled · notified · confirmed · arrived · in_progress · running_late · reschedule_requested · completed · no_show · cancelled · late_cancelled` («late»/«rescheduled» из ТЗ = `running_late`/`reschedule_requested`). AZ-метки и цвета — `APPOINTMENT_STATUS_META` (lib/constants.ts), компонент `AppointmentStatusBadge`. `late_cancelled` дополнительно ставит `lateCancelFlag`. Время врача не блокируют: `cancelled, late_cancelled, no_show`.

## Overlap

Создание запрещено, если у врача есть пересекающийся приём (`startsAt < newEnd AND endsAt > newStart`, кроме неблокирующих статусов) — ошибка «Bu vaxtda həkimin başqa qəbulu var».

## «Son ziyarət»

В списке пациентов колонка заполнена: последний приём со статусом `completed` (include в `listPatients`).

## Known limitations

- Время интерпретируется в таймзоне сервера (= клиники, Asia/Baku). TODO: tz-aware конверсия по `clinics.timezone`.
- Select пациента — до 200 записей; searchable-combobox — позже.
- Неделя начинается с понедельника; рабочие часы врача (`doctors.working_hours`) пока не ограничивают форму.
- Нет редактирования времени/переноса приёма (только статусы) — следующая итерация модуля.
- Drag-and-drop не делался намеренно.

## Next step

**Treatment module**: процедуры по зубу (`treatment_items`) с привязкой к приёму (`appointment_id`), услуги/прайс, статусы плана — поверх готовых dental chart и qəbullar.

## Проверка

`npx tsx scripts/e2e-appointments-check.ts` (нужен dev-сервер + seed).
