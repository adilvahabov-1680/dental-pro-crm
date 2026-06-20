# Treatment Recall / 6-Month Checkup (v1) — Session 44

Закрывает разрыв между «лечение завершено» и «через N времени нужен
контроль»: до Session 44 ничего не напоминало об этом — ни одна модель
не хранила «через 6 месяцев проверить пациента». **`RecallTask` — НЕ
приём.** Это отдельная задача-напоминание; appointment создаётся только
вручную через существующую `/appointments/new`, никогда автоматически.

**WhatsApp остаётся только click-to-chat — никакого WhatsApp Business
API, никакой автоматической отправки, никакого cron.** Patient response/
reschedule full flow (Session 41/43) к recall **не подключён** — пациент
ничего не выбирает по ссылке, сотрудник вручную пишет/звонит после клика
«WhatsApp mesajı hazırla».

## Поток

1. Лечение завершено (`TreatmentItem.status = "done"`) → на карточке
   процедуры (список `/treatments` или `/patients/[id]/treatments`)
   появляется иконка «Kontrol xatırlatması yarat» → `/treatments/[id]/recall`.
2. Сотрудник выбирает preset (7 gün / 30 gün / 6 ay) или свою дату,
   правит заголовок (по умолчанию `"{xidmət} üzrə kontrol"`), опционально
   пишет qeyd → `createRecallTaskAction` создаёт `RecallTask{status:
   pending}`. **Appointment не создаётся, сообщение не отправляется.**
3. Задача видна в очереди `/recalls` (и счётчиком на dashboard) — staff
   видит «Gecikib» (dueDate в прошлом) / «Yaxınlaşır» (≤ 14 дней) для
   всех `pending`/`prepared` задач, отсортированных по dueDate.
4. Сотрудник жмёт «WhatsApp mesajı hazırla» → `prepareRecallMessageAction`
   готовит текст + wa.me-ссылку, пишет запись в «Əlaqə tarixçəsi»,
   `RecallTask.status = prepared`, `preparedAt` ставится. Сотрудник сам
   открывает ссылку и пишет/звонит пациенту.
5. Когда пациент реально записался — сотрудник создаёт приём обычным
   способом (`/appointments/new`) и жмёт «Qəbul yaradıldıqdan sonra
   planlaşdırıldı kimi işarələ» → `RecallTask.status = scheduled`. Если
   пациент отказался или задача больше не нужна — «Bağla» →
   `status = dismissed`. Оба статуса убирают задачу из активной очереди.

## Модель данных — новая таблица, без переиспользования Notification/Appointment

`Notification` не годится: там нет понятия «дата, когда это должно
произойти, отдельно от факта отправки сообщения» и нет lifecycle
pending→prepared→scheduled→dismissed. `Appointment` не годится по
определению — recall **не** приём, пока пациент не подтвердил его
реальной записью. Поэтому — новая модель `RecallTask` (миграция
`20260621000000_add_recall_tasks`, сгенерирована через `prisma migrate
diff` против реальной БД — `migrate dev` падает на shadow-DB из-за
несвязанной с этой сессией исторической миграции, тот же workaround, что
в Session 43):

| Поле | Тип | Назначение |
|---|---|---|
| `clinicId` | uuid | tenant — добавлено в `TENANT_MODELS` (`lib/tenant.ts`) |
| `patientId` | uuid | пациент (обязателен) |
| `doctorId` | uuid? | врач (опционален — recall может быть не привязан к врачу) |
| `treatmentItemId` | uuid? | завершённая процедура, из которой создан recall (v1 UI — всегда есть) |
| `serviceId` | uuid? | услуга (для текста сообщения «{Doctor} həkim üzrə kontrol») |
| `dueDate` | Date (без времени) | когда должен быть контроль |
| `title` / `note` | text | заголовок (по умолчанию из услуги) / опциональная заметка |
| `status` | enum `RecallStatus` | `pending → prepared → {scheduled \| dismissed}` |
| `preparedAt` | timestamptz? | когда подготовлено WhatsApp-сообщение |
| `scheduledAppointmentId` | uuid? | зарезервировано — v1 не заполняет (см. «Не входит в v1») |
| `createdById` | uuid | как `Appointment.createdById` — обычная колонка, без Prisma-relation на `User` |

Tenant isolation — обязателен `clinicId`, как и везде; scope по пациенту
— **тот же** `patientScopeWhere(user)`, что уже использует
`lib/treatments.ts` (доктор/ассистент видят только своих пациентов).

## Создание: `createRecallTaskAction`

`lib/actions/recall-tasks.ts`, право — **`treatments.manage`** (recall
рождается из контекста процедуры, не приёма; follow-up-scheduling
Session 22 для сравнения использует `appointments.manage`, потому что
реально создаёт приём — recall никогда). Правила:

- пациент — `getPatientForUser` (scope), процедура (если указана) —
  `getTreatmentItemForUser` **и** проверка, что её `patientId` совпадает с
  переданным пациентом;
- `dueDate` — строго в будущем (день без времени, `> сегодня`);
- дубликат (тот же `patientId` + `treatmentItemId` + `dueDate`) отклоняется,
  если `treatmentItemId` указан;
- **не двигает и не создаёт appointment**, **не отправляет сообщение** —
  только создаёт запись со `status: pending`.

## WhatsApp: `prepareRecallMessageAction`

Тот же принцип, что `prepareAppointmentReminder` (Session 15) — action
только готовит текст + wa.me-ссылку и пишет лог `status="prepared"`;
сервер ничего не отправляет. **Не вводит нового значения `NotificationType`**
— переиспользует `repeat_visit_reminder`, который существовал в enum **с
самой первой миграции**, но нигде не использовался (как
`PatientResponseLink` до Session 41). AZ-метка добавлена в
`COMMUNICATION_TYPE_META` (`lib/constants.ts`): «Kontrol xatırlatması».

```text
Hörmətli [Patient],
klinikamızda aparılan müalicədən sonra kontrol müayinə vaxtınız çatıb.
[Doctor] həkim üzrə kontrol müayinə.   ← только если RecallTask.doctorId известен

Zəhmət olmasa uyğun vaxt üçün klinika ilə əlaqə saxlayın və ya qəbul üçün müraciət edin.

[Clinic name]
```

Без телефона — `noPhone`, как и везде. После успеха: `RecallTask.status
= prepared`, `preparedAt = now()`, запись в `Notification` (`channel:
whatsapp`, `type: repeat_visit_reminder`).

## Mark scheduled / Dismiss

Обе — простые однополевые actions (`markRecallScheduledAction`,
`dismissRecallAction`), право — тоже `treatments.manage`. **Никакого
выбора/создания appointment** — v1 сознательно ограничен переключением
статуса (ТЗ допускало оба варианта: «select existing appointment id if
easy» или «simple status `scheduled`» — выбран простой, чтобы не
overbuild-ить выбор приёма в этой сессии). `scheduledAppointmentId`
остаётся в схеме как зарезервированное поле для будущей сессии.

Оба статуса (`scheduled`/`dismissed`) — терминальные для v1: задача
перестаёт показываться в `/recalls` (очередь = `pending`/`prepared`
только), но не удаляется (видна через прямой запрос к БД/будущий архив).

## Очередь `/recalls`

`requirePermission("treatments.view")` на странице, `treatments.manage`
гейтит сами кнопки-действия (WhatsApp/mark-scheduled/dismiss) —
assistant (только `.view`) видит строки очереди, но без кнопок.

`listRecallQueue` (`lib/recall-tasks.ts`) — `status IN (pending,
prepared)`, scope по пациенту, сортировка по `dueDate ASC`. На каждой
строке вычисляется `classifyRecallUrgency(dueDate)`:

- **overdue** — `dueDate < сегодня` → бейдж «Gecikib»;
- **due_soon** — `dueDate ≤ сегодня + 14 дней` → бейдж «Yaxınlaşır»;
- **upcoming** — дальше 14 дней — без дополнительного бейджа (задача
  всё равно видна в очереди, просто не выделена).

14 дней — фиксированная константа v1 (`RECALL_DUE_SOON_DAYS`), не
настройка клиники.

## Dashboard-тизер

`RecallSummaryPanel` (виден при `treatments.view`) — счётчики
overdue/due-soon + ссылка на `/recalls`. Нет отдельного пункта в
sidebar — `nav.ts` жёстко связывает один пункт навигации с одним
permission-модулем, а recall сознательно переиспользует
`treatments.*`; заводить отдельный модуль только для пункта меню —
overbuild для v1. Точки входа: dashboard-панель и иконка на карточке
процедуры.

## Не входит в v1 (future)

- WhatsApp Business API / реальная автоматическая отправка.
- cron/queue — никакого фонового планировщика, который бы сам создавал
  recall через N дней после `done` или сам слал сообщения.
- Recurring/infinite schedules (например, «каждые 6 месяцев навсегда») —
  каждый recall создаётся вручную, один раз.
- Advanced treatment protocol engine — привязка набора recall-правил к
  типу услуги/протоколу (сейчас сотрудник выбирает preset вручную каждый
  раз).
- Автоматический выбор/создание appointment при mark-scheduled
  (`scheduledAppointmentId` зарезервирован, не заполняется).
- Patient self-booking, feedback/review flow.

## E2E

`npx tsx scripts/e2e-recall-tasks-check.ts` — 39 проверок: создание с
6-месячным preset (dueDate в будущем, видна в очереди), валидация
(прошлая dueDate / отсутствующая процедура / отсутствующий пациент /
дубликат — все отклоняются без создания записи), очередь (overdue
«Gecikib», due-soon «Yaxınlaşır», статус «Gözləyir» видим), WhatsApp
prepare (wa.me-ссылка, запись в историю коммуникации, `status=prepared`,
`preparedAt`), dismiss (`status=dismissed`, исчезает из очереди), mark
scheduled (`status=scheduled`, **ни одного** нового приёма в БД),
permission (assistant без `treatments.manage` видит строку очереди, но
без `<form>`-кнопок управления; прямые POST-попытки create/prepare
блокируются без изменения данных), tenant isolation (чужой recall не
просвечивает в `/recalls`).

Регрессия: `e2e-communications-check` 40/40, `e2e-appointments-check`
28/28, `e2e-notifications-check` 17/17, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20, `e2e-treatment-protocols-check` 31/31,
`e2e-treatment-consumable-usage-check` 38/38,
`e2e-consumables-audit-visibility-check` 28/28 — все зелёные
(`TreatmentItemCard` — общий компонент, получил новый `recallLabel`).
