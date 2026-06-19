# Patient Reschedule Options Flow (v1) — Session 43

Закрывает «мёртвый конец» Session 41: когда пациент выбирает «Vaxtı dəyişmək
istəyirəm» на `/r/[token]`, приём переходит в `reschedule_requested`, но
дальше ничего не происходило. Session 43 даёт сотруднику предложить 2–3
конкретных времени, а пациенту — выбрать одно по отдельной безопасной
ссылке. **Пациент никогда не видит полный календарь врача** — только то,
что предложила клиника.

**WhatsApp остаётся только click-to-chat — никакого WhatsApp Business API,
никакой автоматической отправки.** Appointment переносится **только** после
того, как пациент сам выбрал вариант по публичной ссылке.

## Поток

1. Пациент на `/r/[token]` (Session 41) выбирает «Vaxtı dəyişmək istəyirəm» →
   `Appointment.status = reschedule_requested`.
2. Сотрудник на карточке пациента видит блок «Pasiyent vaxt dəyişmək
   istəyir» (рендерится только когда `appts.upcoming.status ===
   "reschedule_requested"` и есть `appointments.manage`), вводит 2–3 даты/
   времени → жмёт «Variant linki hazırla».
3. `proposeRescheduleOptions` (`lib/actions/reschedule-options.ts`)
   валидирует варианты, создаёт `PatientResponseLink{purpose:
   "reschedule_offer"}` с вариантами в `response`, готовит WhatsApp-текст
   со ссылкой `/r/<token>` + wa.me-ссылку, пишет запись в «Əlaqə
   tarixçəsi». **Appointment не трогается.**
4. Сотрудник сам отправляет сообщение пациенту (click-to-chat, как и везде
   в проекте).
5. Пациент открывает `/r/<token>` (публично, без сессии) — видит клинику,
   врача, своё текущее время приёма и 2–3 кнопки-варианта, без полного
   календаря и без internal id.
6. `selectRescheduleOptionAction` (`lib/actions/patient-response.ts`)
   обновляет приём (`startsAt`/`endsAt` = выбранный вариант, `status =
   scheduled`), пишет историю коммуникации и staff-уведомление.

## Модель данных — без новой таблицы, c additive-миграцией enum'ов

Никакая таблица не добавлена. `PatientResponseLink.response` (Json,
существовал с `init`) теперь используется **дважды** в рамках одной
ссылки, в зависимости от стадии:

| Стадия | `response` |
|---|---|
| Создана сотрудником (варианты предложены) | `{ kind: "options", options: [{ id, startsAt, endsAt }, …] }` |
| Использована пациентом (вариант выбран) | `{ kind: "selected", selectedOptionId, previousStartsAt, previousEndsAt, newStartsAt, newEndsAt }` |

`options[].id` — стабильный в рамках ссылки идентификатор (`"1"`/`"2"`/
`"3"`), **не** appointment/db id. `endsAt` каждого варианта вычисляется как
`startsAt + (длительность текущего приёма)` — отдельное поле длительности
в форме не вводится (v1: тот же «слот», просто другое время).

**Migration** (`20260620000000_add_reschedule_offer`, additive, тот же
паттерн, что в Session 15/40): добавлено по одному значению в два enum'а —

```sql
ALTER TYPE "NotificationType" ADD VALUE 'reschedule_offer';
ALTER TYPE "LinkPurpose" ADD VALUE 'reschedule_offer';
```

`reschedule_offer` (`LinkPurpose`) отличает эту ссылку от обычной Session 41
`confirm_appointment` — публичная страница рендерит для них совершенно
разные формы (4 кнопки ответа vs 2–3 кнопки-варианта). `reschedule_offer`
(`NotificationType`) — отдельная, читаемая метка в «Əlaqə tarixçəsi»
(`COMMUNICATION_TYPE_META`, `lib/constants.ts`) вместо генерик `custom`.

## Staff-side: `proposeRescheduleOptions`

`lib/actions/reschedule-options.ts`, `appointments.manage`, scope приёма —
`getAppointmentForUser` (как и `prepareAppointmentReminder`). Правила:

- приём должен быть в `status = reschedule_requested` (иначе
  `notRescheduleRequested`);
- у пациента должен быть телефон (`normalizeAzPhone`, иначе `noPhone`,
  как и в Session 15);
- ровно 2 (option1/option2 — обязательные поля формы) или 3 (option3 —
  опциональное поле) варианта; больше 3 в форме просто нет полей —
  ограничение архитектурное (форма), а не runtime-валидация;
- каждый вариант — строго в будущем (`optionsPast`), без дублей
  (`optionsDuplicate`);
- врач не выбирается отдельно — все варианты неявно для того же врача,
  что и текущий приём (v1: без advanced availability engine).

`createOrReplaceRescheduleOptionsLink` (`lib/patient-response.ts`) отзывает
(`status: revoked`) любые прежние активные `reschedule_offer`-ссылки этого
приёма и создаёт новую — у пациента не остаётся двух одновременно
валидных наборов вариантов, если сотрудник переотправил предложение.

## Public-side: `selectRescheduleOptionAction`

`lib/actions/patient-response.ts`, без сессии. Безопасность — тот же
принцип, что и в `submitPatientResponseAction` (Session 41):

- все scoping-данные (`clinicId`/`patientId`/`appointmentId`) — только из
  записи, найденной по `token`;
- single-use через атомарный `updateMany({ where: { id, status: "active" },
  data: { status: "used", … } })` — конкурентный/повторный сабмит даёт
  `count === 0` → `{ error: "alreadyUsed" }`;
- `purpose !== "reschedule_offer"` или несуществующий `optionId` →
  `{ error: "notFound" }` (без различения причин).

После claim: `tenantClient(link.clinicId)` обновляет приём
(`startsAt`/`endsAt` = выбранный вариант, `status: "scheduled"`,
`patientResponseStatus: "pending"` — сброс, т.к. запрос на перенос
разрешился новым конкретным временем, ждать ответа больше не от чего), и
пишет 2 записи в `Notification` (история пациента `channel="other"`,
staff-задача `channel="in_app"`), формат идентичен Session 41.

## Почему `status = "scheduled"`, а не `"confirmed"`

ТЗ Session 43 оставляло выбор. v1: **`scheduled`** — пациент выбрал новое
время, но он не «подтвердил» явку (это будет отдельный confirm-цикл при
следующем напоминании — Session 42 reminder-очередь подхватит этот приём
как обычный `due`-кандидат на новом времени). `confirmed` создавал бы
ложное впечатление, что подтверждение уже получено.

## Публичная страница `/r/[token]` — purpose-branching

`getPublicResponseLinkState` (`lib/patient-response.ts`) теперь возвращает
`purpose` в `kind: "active"`, и (только для `reschedule_offer`) `options`.
`kind: "used"/"expired"/"not_found"` — **общие** для обоих purpose, без
утечки даже факта «какой это был запрос» (та же generic-копия «Linkin
müddəti bitib» / «Bu link artıq istifadə olunub»).

`app/r/[token]/page.tsx` рендерит `RescheduleOptionsSelectionForm`
(`components/patient-response/`) вместо `PatientResponseForm`, когда
`purpose === "reschedule_offer"`. Заголовок страницы тоже меняется
(«Yeni qəbul vaxtı» вместо «Qəbul təsdiqi»). Видны **только**: клиника, имя
пациента, врач, текущее время приёма (для контекста), 2–3 кнопки-варианта
с датой/временем. **Не видны**: appointment/patient/link id, остальные
приёмы врача, что-либо похожее на календарь.

## Dashboard (Session 42 reminder-очередь)

Без изменений в окне/классификации — `responded_reschedule` приёмы уже
показывались. Добавлен только индикатор: если для приёма уже готовилась
`reschedule_offer`-ссылка, строка показывает «Vaxt variantları
göndərilib» рядом с бейджем «Vaxt dəyişmək istəyir» (`listReminderCandidates`
→ `ReminderCandidate.rescheduleOptionsSent`, лёгкий `Notification.findMany`
по `type: "reschedule_offer"`, без новых запросов на каждую строку).

## Не входит в v1 (future)

- WhatsApp Business API / реальная автоматическая отправка.
- Полный календарь/доступность врача на публичной странице.
- Сложный drag/drop календарь для подбора вариантов сотрудником.
- Advanced availability engine (проверка занятости врача на предложенные
  варианты — сотрудник сейчас сам отвечает за корректность выбора).
- Feedback/review flow, 6-month recall, scheduler/cron.
- Выбор другого врача при reschedule (только тот же врач, что в текущем приёме).

## E2E

`npx tsx scripts/e2e-patient-reschedule-options-check.ts` — 39 проверок:
initial reschedule request, staff создаёт 2 варианта (форма видна только
при `reschedule_requested` + `appointments.manage`), валидация (< 2 / past
/ duplicate отклоняются, 4-й вариант структурно игнорируется), публичная
страница (без логина, только варианты, без утечки id, expired/invalid
generic-сообщения), выбор пациентом (время/статус приёма обновлены,
respondedAt/response с old→new, история + staff-уведомление), token safety
(single-use replay, invalid token, cross-tenant — чужая клиника не может
создать варианты для приёма другой клиники), permission (assistant без
`appointments.manage` не видит форму и не может её вызвать).

Регрессия: `e2e-patient-response-links-check` 42/42,
`e2e-appointment-reminder-scheduling-check` 28/28, `e2e-communications-check`
40/40 (бейдж/панель из Session 42 без изменений), `e2e-notifications-check`
17/17, `e2e-appointments-check` 28/28, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20.
