# Appointment Reminder Scheduling v2 — Session 42

Делает очередь напоминаний на dashboard честной: вместо хардкода
today/tomorrow используется реальный clinic setting `reminder_hours_before`,
а статус каждого приёма в очереди отражает, готовилось ли напоминание и
ответил ли пациент. **Без миграции, без авто-отправки, без cron.**

## Что изменилось относительно v1 (Session 15)

V1 (`listReminderCandidates`) показывал приёмы на `[сегодня 00:00,
завтра+1 00:00)` со статусом `scheduled/notified/confirmed` и **скрывал**
приёмы без телефона. `reminder_hours_before` существовал в settings, но
ничего не читало это значение — это и был audit finding Session 42.

V2 читает `reminder_hours_before` из `getClinicParams(user)`
(`lib/settings.ts`) и строит окно `[сейчас, сейчас + reminderHoursBefore]`.
Приёмы без телефона больше не скрываются — они видны со статусом due/prepared,
просто WhatsApp-кнопка отключена (`hasPhone=false`, как и раньше в
`WhatsAppActionButton`).

## Окно и кандидаты (`lib/communications.ts`)

`listReminderCandidates(user)` возвращает `ReminderQueue`:

```ts
interface ReminderQueue {
  candidates: ReminderCandidate[];
  reminderHoursBefore: number; // из clinic settings, по умолчанию 24
  notDueCount: number;         // scheduled/notified приёмы ПОЗЖЕ окна (опционально, для footer-подсказки)
}
```

Кандидат — приём в scope (`appointmentScopeWhere(user)`), `deletedAt: null`,
`startsAt ∈ [now, now + reminderHoursBefore]`, статус ∈
`{scheduled, notified, confirmed, running_late, reschedule_requested,
cancelled}`. Статусы `completed`/`no_show`/`late_cancelled` — вне очереди,
напоминание для них не имеет смысла.

## Классификация (`ReminderStatus`)

Классификация — **прямо из `Appointment.status`**, без отдельного чтения
`patientResponseStatus`: `submitPatientResponseAction` (Session 41) пишет
одно и то же значение в оба поля, так что `status` уже достаточен.

| Appointment.status | ReminderStatus | Badge (AZ) |
|---|---|---|
| `scheduled`/`notified`, нет `Notification{type:appointment_reminder}` | `due` | «Xatırlatma vaxtı çatıb» |
| `scheduled`/`notified`, есть `Notification{type:appointment_reminder}` | `prepared` | «Mesaj hazırlanıb» |
| `confirmed` | `responded_confirmed` | «Təsdiqləyib» |
| `running_late` | `responded_late` | «Gecikə bilər» |
| `reschedule_requested` | `responded_reschedule` | «Vaxt dəyişmək istəyir» |
| `cancelled` | `responded_cancelled` | «Ləğv edib» |

`confirmed` — приём может попасть в этот статус и вручную (сотрудник
поменял статус приёма), и через response link (Session 41) — для очереди
напоминаний это неразличимо и не должно быть: и в том, и в другом случае
напоминание уже не нужно.

"Prepared" больше не привязан к календарному дню (как в v1, `createdAt`
сегодня) — проверяется факт существования `Notification` для appointmentId
вообще, без ограничения по дате, так как окно теперь привязано к времени
приёма, а не к календарным суткам.

## `notDueCount`

Лёгкий `count()` (без выборки строк) приёмов `scheduled`/`notified` с
`startsAt > windowEnd`, в том же scope. Используется только для подсказки
в footer панели («+N hələ vaxtı deyil») — список `candidates` такие приёмы
не включает (`not_due` не показывается построчно по дизайну v2).

## Dashboard UI (`TodayRemindersPanel`)

Панель переименована: «Bugünkü xatırlatmalar» → **«Qəbul xatırlatmaları»**
(заголовок больше не привязан к «сегодня», т.к. окно может быть 1–168
часов). Под заголовком — подсказка `Xatırlatma pəncərəsi: {N} saat ·
Avtomatik göndərilmir`.

Кандидаты группируются в 3 секции (пустые секции не рендерятся):

- **Göndərilməlidir** (`due`);
- **Hazırlanıb** (`prepared`);
- **Pasiyent cavab verib** (все 4 `responded_*`, с собственным badge на
  каждой строке).

Для `responded_*` строк WhatsApp-кнопка **не рендерится вообще** — сотрудник
не должен повторно нажимать «отправить», когда пациент уже ответил
(`«не подталкивать к повторной отправке»`, по ТЗ Session 42). Для `due`/
`prepared` кнопка показывается как раньше (повторный клик создаёт новую
запись лога — намеренное поведение v1, не менялось).

Каждая строка: время, имя пациента (ссылка на карточку), врач, badge
статуса, WhatsApp-кнопка (если применимо). Если телефона нет —
`WhatsAppActionButton` рендерит disabled-кнопку с `title="Telefon nömrəsi
yoxdur"` (без `<form>`) — поведение компонента не менялось, просто теперь
такие приёмы не вырезаны из списка кандидатов на уровне запроса.

## Settings (`/settings`, `ClinicParamsForm`)

Копия `reminder_hours_before` уточнена:

- label: «Qəbuldan neçə saat əvvəl xatırlatma siyahısına düşsün»;
- hint (новая строка под полем): «Bu ayar avtomatik WhatsApp göndərmir;
  sadəcə dashboard siyahısını idarə edir.»

Настройка не добавлена новая — переиспользуется существующий
`SETTING_KEYS.reminderHoursBefore` (`reminder_hours_before`,
`intInRange(1, 168)`).

## Permissions / scope

Видимость очереди не изменилась: `listReminderCandidates` возвращает
`{ candidates: [], reminderHoursBefore: 24, notDueCount: 0 }`, если у
пользователя нет `appointments.view` (или `clinicId` отсутствует —
super_admin). Панель на dashboard рендерится только при
`hasPermission(user, "appointments.view")` — без изменений.

## Совместимость с Session 41

`prepareAppointmentReminder` не менялся: всё так же создаёт/переиспользует
`PatientResponseLink` и вставляет `/r/<token>` в текст. `getOrCreateAppointmentResponseLink`,
`appointmentReminderMessage`, публичный `/r/[token]` — без изменений.

## Не входит в v2 (future)

- WhatsApp Business API / автоматическая отправка.
- cron/queue, точная отправка «день назад в 12:00» — текущая v2 модель —
  это hours-before окно, а не календарный расчёт времени отправки.
- Выбор пациентом нового слота при reschedule (Session 43).
- Feedback/review flow, 6-month recall.

## E2E

`npx tsx scripts/e2e-appointment-reminder-scheduling-check.ts` — создаёт
собственные приёмы с relative-датами (часы от текущего момента), не
зависит от демо-seed дат. Покрывает: окно 24ч/48ч, due-строку (имя/врач/
время/badge/WhatsApp-форма), prepared-переход, все 4 response-статуса,
missing-phone (без WhatsApp-формы, есть label), tenant-изоляцию,
permission (accountant без `appointments.view` не видит панель).

Регрессия: `e2e-patient-response-links-check`, `e2e-communications-check`,
`e2e-notifications-check`, `e2e-appointments-check`, `e2e-demo-flow-check`,
`e2e-admin-check`, `e2e-platform-admin-check` — см. SESSION_HANDOFF.md §7.21.
