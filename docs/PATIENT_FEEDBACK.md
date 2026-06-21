# Patient Feedback / Review Flow (v1) — Session 45

Закрывает третий «зарезервированный, но не использованный» purpose
`LinkPurpose.feedback` (после `confirm_appointment` — Session 41 и
`reschedule_offer` — Session 43; `document_sign` остаётся зарезервированным).
После завершённого приёма или завершённой процедуры сотрудник готовит
безопасную ссылку обратной связи; пациент без логина ставит оценку 1–5 и
пишет опциональный комментарий. **Никакой публикации отзывов наружу,
никакой Google Reviews интеграции, никакого NPS/аналитики — только
внутренняя видимость на карточке пациента и в `/feedback`.**

**WhatsApp остаётся только click-to-chat — никакого WhatsApp Business
API, никакой автоматической отправки.**

## Поток

1. Приём завершён (`status = completed`) или процедура завершена
   (`TreatmentItem.status = done`).
2. Сотрудник на карточке пациента («Son qəbullar», строка с `completed`-
   приёмом) или на карточке процедуры (список `/treatments` или
   `/patients/[id]/treatments`, `status = done`) жмёт «Rəy linki hazırla».
3. `prepareFeedbackLinkAction` (`lib/actions/patient-feedback.ts`)
   проверяет scope+статус, готовит `PatientResponseLink{purpose:
   "feedback"}` (переиспользует активную ссылку для **той же** сущности,
   см. ниже), WhatsApp-текст со ссылкой `/r/<token>` + wa.me-ссылку, пишет
   запись в «Əlaqə tarixçəsi». **Ничего не отправляется и не двигается.**
4. Сотрудник сам отправляет сообщение пациенту.
5. Пациент открывает `/r/<token>` (публично, без сессии) — видит клинику,
   опционально врача/процедуру и текущее время приёма (если есть), ставит
   1–5 звёзд, пишет опциональный комментарий, отправляет.
6. `submitFeedbackAction` (`lib/actions/patient-response.ts`) атомарно
   помечает ссылку использованной, создаёт `PatientFeedback`, пишет
   историю коммуникации и staff-уведомление.

## Модель данных — новая таблица `PatientFeedback`, без новой колонки на `PatientResponseLink`

`LinkPurpose.feedback` существовал в enum **с самой первой миграции** —
не использовался нигде в коде (как `confirm_appointment` до Session 41).
**Миграция не нужна для `LinkPurpose`.**

Для хранения самого отзыва — Variant B из ТЗ (отдельная модель), а не
JSON в `response`: списку/фильтрации на `/feedback` и на карточке
пациента не подходит парсинг JSON по всем `PatientResponseLink` —
типизированная таблица даёт нормальную сортировку по `submittedAt` и
scope по `clinicId`/`patientId`.

```
model PatientFeedback {
  clinicId, patientId            — tenant + scope (как RecallTask)
  appointmentId?, treatmentItemId? — какой приём/процедура комментируется
  responseLinkId (unique FK)      — какая ссылка породила этот отзыв (аудит)
  rating (SmallInt, 1–5)
  comment?
  submittedAt
}
```

Единственная миграция сессии: новая таблица `patient_feedbacks` +
`ALTER TYPE "NotificationType" ADD VALUE 'feedback_received'` (по образцу
Session 44 — для отдельной, читаемой метки в «Əlaqə tarixçəsi» вместо
generic `custom`). **Никакой новой колонки на `patient_response_links`** —
`PatientResponseLink.feedback PatientFeedback?` в schema.prisma — это
только виртуальная back-relation (Prisma требует обе стороны связи),
реальная FK-колонка `response_link_id` живёт на стороне `patient_feedbacks`.

## Проблема «какая сущность» — pending_feedback в `response`

`PatientResponseLink.appointmentId` — реальная колонка, но nullable: для
отзыва о ЗАВЕРШЁННОЙ ПРОЦЕДУРЕ (не приёме) нет appointmentId, а заводить
отдельную колонку `treatmentItemId` на `PatientResponseLink` под одно
поле — overkill (так же, как Session 43 не стала добавлять её для
reschedule). Решение — тот же приём, что и `reschedule_offer`-вариантов:
до использования `response` хранит контекст:

```json
{ "kind": "pending_feedback", "treatmentItemId": "..." | null }
```

После сабмита `response` перезаписывается итогом
`{ rating, comment, submittedAt }` (как и в `submitPatientResponseAction`).

## `getOrCreateFeedbackLink` — переиспользование по сущности, не по пациенту

В отличие от `reschedule_offer` (Session 43, всегда отзывает старую и
создаёт новую — варианты различаются между вызовами), feedback-ссылка
**переиспользуется**, как `confirm_appointment` (Session 41): повторный
клик «Rəy linki hazırla» для **той же** сущности возвращает ту же активную
непросроченную ссылку, а не плодит дубликаты.

Важно — реюз скоупится по сущности, а не просто по пациенту: ищутся все
активные непросроченные `feedback`-ссылки пациента (обычно 0–1, дешёвый
запрос), и среди них ищется та, где `appointmentId` совпадает (для
приёма) либо `treatmentItemId` в `response` совпадает (для процедуры).
Если бы реюз был по пациенту целиком — отзыв о НОВОМ приёме мог бы
получить ссылку со старым контекстом (дата/врач старого приёма) — пациент
увидел бы неверные данные.

## Public-side: `getPublicResponseLinkState` — feedback не требует приёма

Все остальные purpose (`confirm_appointment`, `reschedule_offer`)
обязательно требуют `appointmentId` + найденный `appointment` — иначе
`{ kind: "not_found" }`. **`feedback` — единственное исключение**:
`doctorName`/`startsAt` стали `string | null` / `Date | null` в типе
`PublicResponseLinkState`, плюс новое опциональное поле `serviceName`.
Если у ссылки есть `appointmentId` — контекст (врач/время) берётся из
приёма, как и раньше. Если нет (процедура) — `treatmentItemId` читается
из `response`, и контекст (услуга + врач) подгружается отдельным
маленьким запросом к `TreatmentItem`.

`app/r/[token]/page.tsx`: блок с датой/врачом/услугой рендерится только
если хотя бы одно из трёх полей не `null` — для feedback без привязанной
сущности (теоретически возможно, если оба `appointmentId`/`treatmentItemId`
не указаны) показывается просто имя пациента + клиника + форма.

## «Used» состояние — единственное исключение из «полностью generic»

Session 41/43 сознательно делают `kind: "used"`/`"expired"` **одинаковыми**
для всех purpose — чтобы не раскрывать категорию ссылки по пробным
токенам. Session 45 делает одно исключение: `kind: "used"` теперь несёт
`purpose`, и для `feedback` показывается «Rəy artıq göndərilib» вместо
generic «Bu link artıq istifadə olunub» — по прямому требованию ТЗ (список
AZ-меток). Прецедент уже был: заголовок страницы (`<h1>`) и до этой сессии
менялся по purpose («Yeni qəbul vaxtı» для reschedule_offer) — то есть
категория ссылки и так не считается секретом в этой системе, секрет —
только данные конкретной сущности (patientId/appointmentId/...), которые
никогда не попадают в URL/HTML. `kind: "expired"`/`"not_found"` остались
полностью generic (без purpose) — расхождение между «эта ссылка точно
просрочена» и «такого токена не было» тоже не раскрывается, как и раньше.

## Staff-side: `prepareFeedbackLinkAction`

`lib/actions/patient-feedback.ts`, **`patients.manage`** — выбрано вместо
`appointments.manage`/`treatments.manage`, потому что feedback не привязан
к одному домену (может стартовать и от приёма, и от процедуры), а
`patients.manage` — уже существующий прецедент для «коммуникация о
пациенте в целом» (`logPatientCommunication` использует то же право).
Принимает ОДНО из двух полей формы (`appointmentId` ИЛИ `treatmentItemId`)
— UI всегда передаёт ровно одно, в зависимости от того, откуда вызвана
кнопка (`WhatsAppActionButton` с `hiddenName="appointmentId"` на карточке
пациента, или с `hiddenName="treatmentItemId"` на карточке процедуры).

Правила:
- приём — только `status = "completed"` (иначе `notCompleted`); процедура
  — только `status = "done"`;
- у пациента должен быть телефон (`normalizeAzPhone`, иначе `noPhone`) —
  **без исключения** «всё равно создать ссылку без телефона», хотя ТЗ это
  допускало как опцию («still *maybe* generate link»): v1 сознательно
  следует уже устоявшемуся во всех 4 предыдущих `prepare*`-действиях
  паттерну («нет телефона → ничего не создаётся») для консистентности, а
  не как одноразовое исключение. Документируется здесь как намеренное
  упрощение.

Action возвращает `CommunicationFormState` (`{success, waUrl}` /
`{error}`) — точно тот же формат, что у `prepareAppointmentReminder`/
`prepareRecallMessageAction`, поэтому используется **существующий**
`WhatsAppActionButton` без новой кнопки/формы.

## Public-side: `submitFeedbackAction`

`lib/actions/patient-response.ts`, без сессии. Тот же принцип, что и в
`submitPatientResponseAction`/`selectRescheduleOptionAction`: scoping
только из записи по `token`; single-use через атомарный
`updateMany({ where: { id, status: "active" }, data: { status: "used" } })`.

Валидация (`lib/validation/patient-feedback.ts`): `rating` — целое 1–5
(`z.coerce.number()`, отсутствующее/нечисловое значение или вне диапазона
→ ошибка схемы), `comment` — опционален, максимум 1000 символов. Как и в
двух других public-actions этого проекта, любая ошибка схемы сводится к
generic-сообщению (`{error: "generic"}`) — без точечной разбивки по полю,
для консистентности с `submitPatientResponseAction`/
`selectRescheduleOptionAction`.

После claim создаются: `PatientFeedback` (с `treatmentItemId` из
`response`, если приём не был указан), запись в «Əlaqə tarixçəsi»
(`channel="other"`, `type="feedback_received"`), staff-уведомление
(`channel="in_app"`, `type="feedback_received"`, `userId=null`).

## Внутренняя видимость

- **Карточка пациента** (`PatientFeedbackBlock`, без `showPatient`) — блок
  «Son rəylər» под «Əlaqə tarixçəsi», последние 10.
- **`/feedback`** (`requirePermission("patients.view")`,
  `PatientFeedbackBlock` с `showPatient`) — последние 50 по клинике (с
  учётом scope — врач/ассистент видят только своих пациентов, как и
  везде).

Создание ссылки (`prepareFeedbackLinkAction`) — `patients.manage`;
просмотр (карточка/`/feedback`) — `patients.view`, как и для остальных
блоков карточки пациента (`CommunicationHistoryBlock`).

## Уведомления

Новое значение `NotificationType.feedback_received` (вместо generic
`custom`) добавлено и в `lib/notifications.ts:TYPE_PERMISSION`
(`patients.view`) — без этого tenant-level (`userId=null`) staff-
уведомление было бы **невидимо** в bell/`/notifications` (туда попадают
только типы из этой карты). AZ-метка — в `COMMUNICATION_TYPE_META`
(«Rəy») и в иконке `NotificationsList` (`Star`).

~~**Найдено по ходу, не исправлено в этой сессии**: `reschedule_offer`
(Session 43) тоже создаёт tenant-level staff-уведомление, но никогда не
был добавлен в `TYPE_PERMISSION` — он невидим в bell уже две сессии. Вне
scope Session 45 (чужой код, отдельная задача).~~ ✅ исправлено в Session 46
— см. **[NOTIFICATIONS.md](NOTIFICATIONS.md)**, раздел «Дополнение (Session 46)».

## Не входит в v1 (future)

- WhatsApp Business API / реальная автоматическая отправка.
- Публичная страница отзывов (маркетинговая, наружу).
- Google Reviews / другие внешние интеграции.
- NPS/аналитика, агрегация среднего рейтинга, дашборд-виджет рейтинга.
- Полный patient portal.
- Привязка к другому врачу/услуге, кроме той, что у исходного приёма/процедуры.

## E2E

`npx tsx scripts/e2e-patient-feedback-check.ts` — 40 проверок: генерация
ссылки (от приёма и от процедуры — два разных сценария хранения контекста),
публичная страница (без логина, без утечки id), сабмит (рейтинг+комментарий
сохранены, ссылка использована, staff-уведомление, история коммуникации),
валидация (отсутствующий/0/6 рейтинг и слишком длинный комментарий
отклоняются без создания записи), token safety (replay, expired, invalid),
внутренняя видимость (карточка пациента + `/feedback`) и tenant isolation,
permission (assistant без `patients.manage` не видит форму и не может её
вызвать, но видит `/feedback` благодаря `patients.view`).

Регрессия: `e2e-patient-response-links-check` 42/42,
`e2e-patient-reschedule-options-check` 39/39, `e2e-recall-tasks-check`
39/39, `e2e-communications-check` 40/40, `e2e-notifications-check` 17/17,
`e2e-appointments-check` 28/28, `e2e-demo-flow-check` 11/11,
`e2e-admin-check` 36/36, `e2e-platform-admin-check` 42/42,
`e2e-dashboard-check` 20/20, `e2e-treatment-protocols-check` 31/31,
`e2e-consumables-audit-visibility-check` 28/28 (последние два — регрессия
`TreatmentItemCard`/`lib/treatments.ts`, общие файлы).
