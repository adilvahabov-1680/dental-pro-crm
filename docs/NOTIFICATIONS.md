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
2. tenant-level (`userId = null`) — если есть право на модуль типа:
   `inventory_low_stock → inventory.view`, `debt_reminder → finance.view`,
   `appointment_* → appointments.view`, `treatment_pdf → documents.view`,
   `custom → notifications.view`.

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

## E2E

`npx tsx scripts/e2e-notifications-check.ts` — страница, bell-счётчик,
mark one/all read, изоляция тенанта, отсутствие доступа у assistant.
