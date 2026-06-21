# Bildirişlər — Notifications UI (v1)

Сессия 11. UI для in-app уведомлений сотрудников. Создание low-stock
notifications реализовано в сессии 10 (`lib/actions/inventory.ts`,
переход normal→low/out, без спама).

## Объём v1

- Bell в topbar (`components/layout/Topbar.tsx`) с unread-счётчиком,
  виден только при `notifications.view`.
- Страница `/notifications`: список последних 50, статус read/unread,
  «Oxundu kimi işarələ» по одному и «Hamısını oxundu et».
- Для `inventory_low_stock` — ссылка «Anbara bax» на `/inventory?low=1`
  (id материала в schema notification не хранится — ссылка на low-фильтр).

НЕ входит: real-time/websocket, push, email/SMS-отправка, preferences.

## Видимость (lib/notifications.ts)

Пользователь видит только `channel = in_app` своего тенанта:

1. личные — `userId = текущий пользователь`;
2. tenant-level (`userId = null`) — если есть право на модуль типа
   (`TYPE_PERMISSION`, `lib/notifications.ts`):

   | `NotificationType` | Право | Создаётся ли сейчас как `channel=in_app` |
   |---|---|---|
   | `appointment_reminder` | `appointments.view` | да (Session 41 — ответ пациента) |
   | `followup` | `appointments.view` | нет — зарезервирован |
   | `repeat_visit_reminder` | `appointments.view` | нет — пока только `channel=whatsapp` (Session 44 prepare-шаг) |
   | `reschedule_offer` | `appointments.view` | да (Session 43 — выбор пациента); **добавлено в Session 46, см. ниже** |
   | `feedback_received` | `patients.view` | да (Session 45 — сабмит отзыва) |
   | `treatment_pdf` | `documents.view` | нет — зарезервирован |
   | `debt_reminder` | `finance.view` | нет — зарезервирован |
   | `inventory_low_stock` | `inventory.view` | да (Session 10) |
   | `custom` | `notifications.view` | нет — зарезервирован |

   `document_message`/`payment_reminder`/`manual_note` в этой таблице нет
   намеренно — они никогда не создаются с `channel=in_app` (всегда
   whatsapp/sms/phone/other), поэтому фильтр `channel: "in_app"` в
   `notificationScopeWhere` исключает их раньше, чем дело доходит до
   `TYPE_PERMISSION` — добавлять их туда было бы мёртвым кодом.

Пациентские каналы (sms/whatsapp/email) — очередь отправки, в UI сотрудника
не показываются.

«Непрочитанное» = `status != read` (pending/sent/delivered/failed).

## Mark read (lib/actions/notifications.ts)

`updateMany` поверх scope-where: чужое уведомление (другой tenant или другой
userId) в where не попадает — отдельная проверка владения не нужна.
Требование: `notifications.view` (отметка прочитанным — не manage-действие).

Ограничение v1: per-user read-state для tenant-level уведомлений не хранится —
«прочитано» отмечается на самой записи (один сотрудник прочитал → прочитано
для всех). Для med-CRM v1 приемлемо; при необходимости — таблица
`notification_reads` в следующих версиях.

## Дополнение (Session 41): staff-уведомления об ответе пациента

Когда пациент отвечает по ссылке `/r/<token>` (см.
[PATIENT_RESPONSE_LINKS.md](PATIENT_RESPONSE_LINKS.md)), `submitPatientResponseAction`
создаёт tenant-level уведомление: `channel=in_app`, `type=appointment_reminder`,
`userId=null`, `status=pending`. Оно попадает под существующее правило видимости
(`appointment_reminder → appointments.view`), поэтому видно в bell и на `/notifications`
всем сотрудникам клиники с правом `appointments.view`, без новых типов/каналов и без
изменения логики этого модуля. Тексты: подтвердил / может опоздать / просит перенос /
хочет отменить.

## Дополнение (Session 46): fix — reschedule_offer не был в TYPE_PERMISSION

Найдено при разработке Session 45: `selectRescheduleOptionAction` (Session 43,
`lib/actions/patient-response.ts`) создаёт ровно такое же tenant-level
`channel=in_app` уведомление (`type=reschedule_offer`), что и
`submitPatientResponseAction` (Session 41) для `appointment_reminder` — но
`reschedule_offer` никогда не был добавлен в `TYPE_PERMISSION`. Результат:
запись создавалась в БД корректно, но `visibleTenantTypes(user)` никогда не
включал `reschedule_offer` — уведомление было **невидимо в bell и на
`/notifications` для всех, независимо от прав** (баг видимости, не баг
данных — запись существовала, просто не проходила фильтр). Не давал о себе
знать две сессии, потому что ни один прежний e2e не проверял именно
видимость этого типа в самом `/notifications` — `e2e-patient-reschedule-options-check.ts`
проверял только, что запись есть в БД (`!!staffNotifE`), не то, что она
реально отображается пользователю.

**Fix**: одна строка — `reschedule_offer: "appointments.view"` добавлена в
`TYPE_PERMISSION` (та же логика, что у `appointment_reminder`/`followup`/
`repeat_visit_reminder` — это appointment-домен). Дополнительно (Session 46):
- `i18n/az.ts`: `notifications.types.reschedule_offer`/`feedback_received`
  добавлены — `NotificationsList.tsx` рендерит `labels.types[n.type] ??
  n.type`, и без этого тип показался бы как сырое имя enum'а вместо AZ-метки
  (этот словарь **отдельный** от `COMMUNICATION_TYPE_META`, который относится
  к патиентской «Əlaqə tarixçəsi», не к bell — у `feedback_received` там уже
  была метка с Session 45, но в `notifications.types` её не было);
- `NotificationsList.tsx`: `TYPE_ICON.reschedule_offer` — добавлена иконка
  `CalendarClock` (та же, что в `RescheduleOptionsSelectionForm`/
  `PatientResponseForm` для reschedule-варианта ответа). Без неё рендерился
  бы fallback `Bell` — не баг, просто менее узнаваемо.

**Полный аудит TYPE_PERMISSION** (см. таблицу выше) подтвердил, что
`reschedule_offer` был **единственным** реально создаваемым `channel=in_app`
типом без записи в карте — `feedback_received` (Session 45) и
`inventory_low_stock` (Session 10) уже были корректны;
`followup`/`treatment_pdf`/`debt_reminder`/`custom`/`repeat_visit_reminder`
(для in-app) зарезервированы и нигде не создаются — записи для них в карте
безвредны (forward-looking, тот же паттерн, что уже был у `repeat_visit_reminder`
до Session 44 и у `feedback_received`/`reschedule_offer` до своих сессий).

**Mark-read архитектура — без изменений, баг там не подтверждён.**
`markNotificationRead`/`markAllNotificationsRead` уже применяют
`notificationScopeWhere(user)` внутри `updateMany`-where — пользователь не
может (и не мог) пометить прочитанным то, что не входит в его видимый scope;
`markAllNotificationsRead`, вызванный пользователем с урезанными правами,
корректно помечает прочитанным только видимый ему поднабор, не трогая
остальное. Проверено в e2e (Session 46) — никакого редизайна не требовалось.

## E2E

`npx tsx scripts/e2e-notifications-check.ts` — страница, bell-счётчик,
mark one/all read, изоляция тенанта, отсутствие доступа у assistant; plus
(Session 46) видимость `reschedule_offer`/`feedback_received`/
`repeat_visit_reminder` для пользователя с нужным правом, **отсутствие**
видимости для пользователя без него (роль `reception` + personal-deny на
`appointments.view`/`patients.view` — даёт «есть `notifications.view`, но
нет appointment/patient-доступа», изолированно проверяя именно
`TYPE_PERMISSION`-фильтрацию, а не внешний page-gate), delta unread-счётчика
(+3 у владельца, +0 у урезанного пользователя), и что `mark all as read` от
урезанного пользователя не трогает уведомления вне его scope.
