# Patient Response Links (v1) — Session 41

Foundation для безлогинного ответа пациента на напоминание о приёме. Клиника готовит
WhatsApp-напоминание (click-to-chat, как в Session 15), в текст автоматически вставляется
**уникальная безопасная ссылка**. Пациент открывает её без логина и выбирает один из четырёх
ответов; CRM обновляет статус приёма, пишет историю коммуникации и создаёт staff-уведомление.

**WhatsApp остаётся только click-to-chat — никакого WhatsApp Business API, никакой
автоматической отправки.** Ссылка лишь добавлена в текст, который сотрудник по-прежнему
отправляет вручную.

## Поток

1. Сотрудник на карточке пациента (или панели «Bugünkü xatırlatmalar» на dashboard) жмёт
   «WhatsApp xatırlatma» → `prepareAppointmentReminder` (`lib/actions/communications.ts`).
2. Action вызывает `getOrCreateAppointmentResponseLink` — **переиспользует** активную
   непросроченную ссылку приёма либо создаёт новую (один активный токен на приём, без
   размножения).
3. В текст напоминания добавляется абсолютная ссылка `/r/<token>` + список вариантов ответа.
   Запись лога коммуникации (`status="prepared"`) создаётся как и раньше.
4. Пациент открывает `/r/<token>` (публично, без сессии), видит минимум данных и выбирает
   ответ.
5. `submitPatientResponseAction` (`lib/actions/patient-response.ts`) обновляет приём, пишет
   историю и создаёт staff-уведомление.

## Модель данных — без миграции

`PatientResponseLink` уже существовал в схеме (с самого `init`, но нигде не использовался).
Session 41 ничего не добавляла в схему — используются существующие поля:

| Поле | Использование в v1 |
|---|---|
| `token` | crypto-random, `randomBytes(32).toString("base64url")` (256 бит), unique |
| `clinicId` / `patientId` / `appointmentId` | tenant + связи (FK) |
| `purpose` (`LinkPurpose`) | `confirm_appointment` (этот файл), `reschedule_offer` (Session 43) либо `feedback` (Session 45, см. ниже); `document_sign` пока не используется |
| `status` (`LinkStatus`) | `active` → `used`. `expired`/`revoked` поддержаны при чтении, но фоновой джобы нет — «просрочено» вычисляется из `expiresAt` на лету |
| `expiresAt` | now + 48ч (`RESPONSE_LINK_TTL_HOURS`) |
| `respondedAt` | момент ответа |
| `responseType` (`ResponseType`) | `confirm` / `running_late` / `reschedule_request` / `cancel` |
| `responseComment` | опциональный комментарий пациента (textarea, max 500) |
| `response` (Json) | `{ responseType, comment, submittedAt }` |

## Соответствие статусов

`ResponseType` (значения ссылки) и `AppointmentStatus`/`PatientResponseStatus` (значения
приёма) имеют **разное написание** — маппинг в `RESPONSE_TO_STATUS`:

| Ответ пациента (`ResponseType`) | Статус приёма (`AppointmentStatus` + `patientResponseStatus`) |
|---|---|
| `confirm` | `confirmed` |
| `running_late` | `running_late` |
| `reschedule_request` | `reschedule_requested` |
| `cancel` | `cancelled` |

Все четыре `AppointmentStatus` уже существовали — enum не менялся. `Appointment.status` и
кэш `Appointment.patientResponseStatus` получают **одно и то же** знач-статус из
`RESPONSE_TO_STATUS` (не «сырое» `ResponseType`).

UI приёмов отражает это автоматически: `APPOINTMENT_STATUS_META` уже содержит AZ-метки
(`Təsdiqləndi` / `Gecikir` / `Vaxt dəyişmə sorğusu` / `Ləğv edildi`), а `AppointmentStatusBadge`
рендерит их на карточке пациента, в списке и на детальной странице — отдельный «response
badge» не вводился.

## Публичная страница `/r/[token]`

- Вне route-группы `(dashboard)` → без сайдбара/топбара, голый root layout.
- `middleware.ts`: явный bypass для `/r` и `/r/...` (рядом с `/api/health`). Намеренно **не**
  через `PUBLIC_PATHS`, т.к. та логика ещё и редиректит залогиненного пользователя на
  `/dashboard` — здесь это не нужно (сотрудник должен мочь открыть ссылку, не выходя).
- Показывает **только**: название клиники, имя пациента (Soyad Ad), имя врача, дату/время
  приёма, 4 кнопки ответа, опциональный комментарий. **Не** показывает: internal id (appointment/
  patient/link id), медицинскую историю, счета, документы, детали лечения.
- Состояния: `active` (форма), `used`/`revoked` («Bu link artıq istifadə olunub»),
  `expired`/`not_found` («Linkin müddəti bitib» — единый generic-текст, чтобы не различать
  «нет такого токена» и «просрочен»).

## Действие пациента (public, без логина)

`submitPatientResponseAction`:
- token + responseType (+ опциональный comment) из формы; **никакого clinicId/id с клиента**.
- Все scoping-данные (`clinicId`/`patientId`/`appointmentId`) берутся **только** из записи,
  найденной по уникальному `token` (`prisma.patientResponseLink.findUnique({ where: { token } })`).
- **Single-use** через атомарный `updateMany({ where: { id, status: "active" }, data: { status:
  "used", ... } })` — конкурентный/повторный сабмит даёт `count === 0` → `{ error: "alreadyUsed" }`.
- После claim: `db = tenantClient(clinicId из записи)` → обновляет приём, пишет 2 записи в
  `Notification`:
  - **история пациента**: `channel="other"`, `type="appointment_reminder"`,
    `status="prepared"`, `patientId` set → видна в «Əlaqə tarixçəsi»;
  - **staff-задача**: `channel="in_app"`, `type="appointment_reminder"`, `userId=null`
    (tenant-level), `status="pending"` → видна в bell/`/notifications` всем с `appointments.view`.
- Идемпотентность: повторный сабмит на использованный/просроченный/несуществующий токен
  ничего не меняет и не создаёт дублей.

## Безопасность

- **Токен**: 256-бит crypto-random, URL-safe, непредсказуемый, не sequential; в URL нет
  patientId/appointmentId.
- **Формат-гард**: `/^[A-Za-z0-9_-]{20,64}$/` отсекает мусор до похода в БД.
- **Expiration** и **single-use** форсируются на сервере (не доверяем UI-состоянию).
- **Нет cross-tenant утечки**: поиск только по `token`; никакого перебора id.
- **Public action не требует сессии**, но и не принимает clinicId/scope с клиента.
- **Internal generation** (`prepareAppointmentReminder`) — `appointments.manage`, scope приёма
  через `getAppointmentForUser`, clinicId только из сессии.
- **Rate limiting** — НЕ реализован в v1 (future; задокументировано здесь как ограничение).

## Текст напоминания и base URL

`appointmentReminderMessage` получил **опциональные** `doctorName` / `responseUrl` (старые
4-аргументные вызовы продолжают работать). При наличии `responseUrl` к тексту добавляется блок
со ссылкой и вариантами ответа.

Абсолютный URL строит `buildPatientResponseUrl`: берёт `NEXT_PUBLIC_APP_URL`, иначе —
заголовки текущего запроса (`x-forwarded-host`/`host` + `x-forwarded-proto`). Работает в
dev/prod без настройки; явный `NEXT_PUBLIC_APP_URL` нужен только за нестандартным proxy/CDN.

## Не входит в v1 (future)

- WhatsApp Business API / реальная автоматическая отправка.
- ~~Выбор пациентом нового слота при reschedule (staff предлагает 2-3 времени)~~ ✅ сделано в
  Session 43, см. ниже и **[PATIENT_RESCHEDULE_OPTIONS.md](PATIENT_RESCHEDULE_OPTIONS.md)**.
- Reason-форма для отмены сверх простого опционального комментария.
- ~~Feedback/review flow~~ ✅ сделано в Session 45, см. ниже и
  **[PATIENT_FEEDBACK.md](PATIENT_FEEDBACK.md)**.
- ~~6-month recall~~ ✅ сделано в Session 44, см. **[RECALL_TASKS.md](RECALL_TASKS.md)**.
- Scheduler/cron, rate limiting публичного роута.

## E2E

`npm run e2e-patient-response-links-check` — 42 проверки: генерация/переиспользование ссылки,
наличие ссылки в тексте напоминания, публичная страница без логина + отсутствие утечки id,
expired/used/invalid состояния, confirm/late/reschedule/cancel (статус приёма + история +
staff-уведомление), single-use replay-guard, отсутствие сессии во всём публичном потоке.

Регрессия: `e2e-communications-check` 40/40 (текст напоминания — существующие assert'ы
сохранены, локальная копия `appointmentReminderMessage` в тесте намеренно осталась
4-аргументной), `e2e-appointments-check`, `e2e-notifications-check`, `e2e-demo-flow-check`,
`e2e-admin-check`, `e2e-platform-admin-check` — зелёные.

## Дополнение (Session 42): очередь напоминаний читает Appointment.status

Dashboard-панель «Qəbul xatırlatmaları» (бывшая «Bugünkü xatırlatmalar») теперь
классифицирует каждый приём в очереди как `due`/`prepared`/`responded_confirmed`/
`responded_late`/`responded_reschedule`/`responded_cancelled` — последние четыре читаются
прямо из `Appointment.status`, который Session 41 уже приводит к одному из этих значений
через `RESPONSE_TO_STATUS`. Никакого нового «response badge» не вводилось — badge'и
переиспользуют ту же модель, что и `APPOINTMENT_STATUS_META`. Ничего в этом файле
(`lib/patient-response.ts`, `lib/actions/patient-response.ts`, `/r/[token]`) не менялось.
Детали окна/группировки — **[APPOINTMENT_REMINDER_SCHEDULING.md](APPOINTMENT_REMINDER_SCHEDULING.md)**.

## Дополнение (Session 43): вторая purpose — reschedule_offer

`PatientResponseLink` теперь обслуживает два разных публичных потока через
`purpose`: `confirm_appointment` (этот файл, Session 41, 4 кнопки ответа) и
`reschedule_offer` (Session 43, 2–3 кнопки-варианта времени). Это **additive**
изменение enum'а (`LinkPurpose`/`NotificationType` + значение
`reschedule_offer`, миграция `20260620000000_add_reschedule_offer`) —
ничего из описанного выше не меняется для `confirm_appointment`-ссылок.

`response` (Json) для `reschedule_offer` хранит то, что в этом файле
называется «значения после выбора пациента»: до выбора —
`{ kind: "options", options: [...] }` (предложено сотрудником), после —
`{ kind: "selected", selectedOptionId, previousStartsAt/EndsAt,
newStartsAt/EndsAt }`. `getPublicResponseLinkState` теперь возвращает
`purpose` и (только для `reschedule_offer`) `options` в `kind: "active"` —
`used`/`expired`/`not_found` остаются общими для обоих purpose без какой-либо
утечки информации о том, какой именно поток это был.

Полная схема (staff-форма, валидация, перенос приёма, безопасность) —
**[PATIENT_RESCHEDULE_OPTIONS.md](PATIENT_RESCHEDULE_OPTIONS.md)**.

## Дополнение (Session 45): третья purpose — feedback

`LinkPurpose.feedback` (существовал в enum с самой первой миграции,
аналогично `confirm_appointment` до Session 41) теперь обслуживает третий
публичный поток — отзыв 1–5 после завершённого приёма/процедуры.
**Единственная purpose, для которой `appointmentId` опционален** —
`getPublicResponseLinkState` больше не требует найденный приём, если
`purpose === "feedback"`; контекст (врач/услуга) в этом случае читается
из `treatmentItemId`, сохранённого в `response` при создании ссылки
(`{ kind: "pending_feedback", treatmentItemId }`, по аналогии с `{ kind:
"options", ... }` у `reschedule_offer`).

`kind: "used"` теперь несёт `purpose` (раньше — только
`responseType: string | null`) — единственное отступление от принципа
«used/expired полностью generic для всех purpose»: для feedback показывается
«Rəy artıq göndərilib» вместо общей фразы, по прямому требованию ТЗ.
`expired`/`not_found` остались без изменений (полностью generic).

Полная схема (модель `PatientFeedback`, staff-action, валидация,
безопасность) — **[PATIENT_FEEDBACK.md](PATIENT_FEEDBACK.md)**.
