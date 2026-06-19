# Əlaqə / Patient Communication (v1)

Сессия 15. Ручной (manual, click-to-chat) лог коммуникаций с пациентом +
WhatsApp-шаблоны. **Никакой реальной отправки** (нет API/webhook/SMS/email
интеграции) — сервер только готовит текст, ссылку wa.me и пишет запись лога;
открыть `wa.me`-ссылку и отправить сообщение должен сам сотрудник.

## Объём v1

- **Əlaqə tarixçəsi** — блок на карточке пациента
  (`components/communications/CommunicationHistoryBlock.tsx`): последние 50
  записей коммуникации (whatsapp/sms/phone/other), новые сверху.
- **WhatsApp click-to-chat кнопки** (`WhatsAppActionButton`, открывает
  `wa.me`-ссылку через `window.open` на клиенте):
  - напоминание о приёме (карточка пациента + dashboard-панель
    «Bugünkü xatırlatmalar»);
  - напоминание об оплате счёта (страница счёта, при `balance > 0`);
  - сообщение о готовом документе (карточка пациента, для загруженных
    файлов).
- **Ручная запись** (`LogCommunicationForm`): сотрудник вручную фиксирует
  звонок/сообщение (канал phone/whatsapp/sms/other + текст заметки).
- **Bugünkü xatırlatmalar** — панель на dashboard
  (`TodayRemindersPanel`, `listReminderCandidates`): приёмы на
  сегодня/завтра со статусом scheduled/notified/confirmed и телефоном
  пациента; бейдж «Hazırlanıb», если напоминание для этого приёма уже
  подготовлено сегодня.

НЕ входит (и не планируется добавлять без отдельного решения): реальная
отправка через WhatsApp/SMS/email API, webhooks, delivery tracking/статусы
доставки, retries/очереди, биллинг сообщений, массовые рассылки/кампании,
редактор шаблонов, публичные ссылки на документы.

## Хранение (lib/communications.ts, lib/actions/communications.ts)

Новой таблицы не вводили — переиспользуется существующая `Notification`:

- `channel ∈ {whatsapp, sms, phone, other}` (новые допустимые значения для
  пациентских коммуникаций, в дополнение к `in_app`);
- `type ∈ {appointment_reminder, payment_reminder, document_message,
  manual_note}` (новые значения enum);
- `status = "prepared"` — означает «текст/ссылка подготовлены вручную»,
  НЕ «отправлено». В v1 это терминальный статус — никакой фоновый процесс
  его не меняет;
- `scheduledAt = sentAt = now()` при создании (поля заполняются для
  совместимости со старой схемой notifications, без отдельного смысла в v1);
- связи через nullable FK: `appointmentId`, `invoiceId`, `documentId` —
  в зависимости от типа записи.

`listPatientCommunications(user, patientId)` — только tenant-фильтр,
вызывать ТОЛЬКО после `getPatientForUser` (как и другие `listPatient*`).

## Нормализация телефона и wa.me-ссылка

`normalizeAzPhone(phone)`:

- принимает `"050 123 45 67"`, `"+994501234567"`, `"994501234567"`,
  9-значный локальный номер без кода;
- возвращает международный формат без `+` (`"994501234567"`) или `null`,
  если телефона нет/формат не распознан.

`buildWhatsAppUrl(phone, text) = "https://wa.me/<phone>?text=<encoded text>"`.

Если `normalizeAzPhone` вернул `null` — кнопка WhatsApp отображается
неактивной (без `<form>`), `WhatsAppActionButton` показывает
`noPhoneLabel`; серверное действие (если всё же вызвано) возвращает
`{ error: "noPhone" }` и **не создаёт запись**.

## Тексты сообщений (lib/communications.ts)

- `appointmentReminderMessage({ patientName, clinicName, date, time })`
- `paymentReminderMessage({ patientName, clinicName, balance })` —
  `balance = invoice.total - invoice.paidAmount`, форматируется через
  `formatMoney(..., "AZN")`
- `documentMessage({ patientName, clinicName, docLabel })` — `docLabel`
  берётся из `document.title` (fallback — AZ-название типа документа из
  `DOCUMENT_TYPE_META`). Сообщение **не содержит** ссылку на скачивание,
  `fileUrl` или внутренний `id` документа — только факт «sənəd klinikada
  hazırdır».

Все тексты на AZ, без шаблонизатора — фиксированный набор фраз под v1.

## Bugünkü xatırlatmalar (listReminderCandidates)

- Источник — приёмы tenant'а в окне `[сегодня 00:00, завтра+1 00:00)`,
  `deletedAt = null`, статус ∈ `{scheduled, notified, confirmed}`,
  отфильтрованные через `appointmentScopeWhere(user)`.
- Из результата убираются пациенты без телефона (`normalizeAzPhone` не
  проверяется здесь напрямую — фильтр по `patient.phone` непустому).
- `alreadyPrepared = true`, если для этого `appointmentId` уже есть
  `Notification{ type: "appointment_reminder", createdAt: сегодня }`.
- Видимость панели — `appointments.view` (как и сама панель на dashboard).

## Permissions / scope

| Действие | Право | Доп. проверка |
|---|---|---|
| `logPatientCommunication` (ручная запись) | `patients.manage` | `getPatientForUser` — пациент должен быть в scope (tenant + роль) |
| `prepareAppointmentReminder` | `appointments.manage` | `getAppointmentForUser` — приём в scope |
| `prepareInvoiceReminder` | `finance.manage` | `getInvoiceForUser` — счёт в scope |
| `prepareDocumentMessage` | `documents.manage` | документ ищется через `patientScopeWhere(user)`, `deletedAt: null` |

Доступ к самому блоку «Əlaqə tarixçəsi» (просмотр истории) — наследует
`patients.view` (часть карточки пациента). WhatsApp-кнопки и форма ручной
записи рендерятся только при наличии соответствующего `*.manage`.

Все 4 действия — чужой пациент/приём/счёт/документ (другой tenant или вне
ролевого scope, например пациент другого врача для роли doctor/assistant)
→ `{ error: "notFound" }`, запись не создаётся (проверено e2e).

## E2E

`npx tsx scripts/e2e-communications-check.ts` — 40 проверок:
нормализация телефона, генерация текстов и wa.me-ссылок, появление блока
«Əlaqə tarixçəsi», подготовка напоминания о приёме (через панель
«Bugünkü xatırlatmalar» на dashboard) с записью в историю, ручная запись
коммуникации, блокировка напоминания при отсутствии телефона (Aysu),
напоминание об оплате счёта с балансом в тексте, сообщение о документе без
утечки приватной ссылки, видимость dashboard-панели и бейджа «Hazırlanıb»,
scope-изоляция для doctor (cross-patient) и cross-tenant.

## Известные ограничения v1

- `status = "prepared"` не меняется автоматически — нет способа узнать,
  отправил ли сотрудник сообщение фактически.
- Один и тот же приём/счёт/документ можно «подготовить» повторно — каждый
  клик создаёт новую запись лога (намеренно, для истории попыток связаться).
- Текст сообщений — фиксированные AZ-шаблоны, без редактора и без
  персонализации сверх имени/даты/суммы.

## Дополнение (Session 41): ссылка ответа пациента в напоминании

`prepareAppointmentReminder` теперь вставляет в текст напоминания о приёме
безопасную ссылку `/r/<token>`, по которой пациент **без логина** выбирает
ответ (gələcəyəm / gecikə bilərəm / vaxtı dəyişmək / ləğv etmək). Ответ
обновляет статус приёма, пишет запись в «Əlaqə tarixçəsi» (`channel="other"`,
`type="appointment_reminder"`) и создаёт staff-уведомление. **WhatsApp
по-прежнему только click-to-chat — ссылка лишь добавлена в текст, сервер
ничего не отправляет.** Детали, безопасность и формат токена —
**[PATIENT_RESPONSE_LINKS.md](PATIENT_RESPONSE_LINKS.md)**.

`appointmentReminderMessage` получил опциональные `doctorName`/`responseUrl`
(старые 4-аргументные вызовы не сломаны). Локальная standalone-копия этой
функции в `scripts/e2e-communications-check.ts` намеренно оставлена
4-аргументной — её unit-level assert по подстроке «qəbulunuz … planlaşdırılıb»
по-прежнему валиден, а проверка вставки ссылки покрыта отдельным
`e2e-patient-response-links-check`.
