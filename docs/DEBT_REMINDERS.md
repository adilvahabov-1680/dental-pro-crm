# Debt Reminder / Payment Communication (v1)

Сессия 47. Очередь напоминаний об ödəniş долгах + WhatsApp click-to-chat
по конкретному счёту. **Никакой реальной отправки** — сервер только готовит
текст, ссылку wa.me и пишет запись лога; нет payment gateway, нет online
payment link, нет cron-автоматизации.

## Объём v1

- **`/finance/debts`** — очередь debt reminder
  (`listDebtReminderCandidates`, `lib/finance.ts`): все открытые/частичные
  `Debt` в scope пользователя (по пациенту, как остальные finance-запросы),
  сортировка — самый большой остаток первым (при равенстве — старый долг
  впереди).
- Кнопка **«Ödəniş xatırlatması hazırla»** на каждой строке очереди —
  переиспользует существующее действие `prepareInvoiceReminder` (Session 15,
  `lib/actions/communications.ts`) и существующий `WhatsAppActionButton`.
  Новое действие не вводилось — `prepareInvoiceReminder` уже делает то, что
  нужно (текст + wa.me-ссылка + запись в `Notification`), не хватало только
  двух вещей (добавлены в этой сессии, см. ниже).
- Ссылка на очередь — из `/finance` (кнопка «Borclar» в шапке) и из карточки
  пациента (блок «Ödənişlər» теперь показывает `Son xatırlatma` рядом с
  debt-бейджем).

## Что изменилось в `prepareInvoiceReminder`

1. **Блокировка полностью оплаченного/отменённого счёта**: до генерации
   текста действие проверяет `invoice.status === "paid" | "cancelled"` или
   `balance <= 0` → `{ error: "fullyPaid" }`, запись не создаётся. Раньше
   действие безусловно готовило напоминание для любого счёта в scope (UI
   просто не показывал кнопку при `balance === 0`, но сервер не
   перепроверял).
2. **`Debt.lastReminderAt`**: после успешной записи в `Notification`
   действие обновляет `lastReminderAt = now()` на связанном `Debt`
   (`db.debt.updateMany({ where: { invoiceId }, data: { lastReminderAt } })`).
   Поле существовало в схеме с самого начала (`prisma/schema.prisma`), но
   до этой сессии ничего его не заполняло.

Permission/scope — без изменений: `finance.manage`, `getInvoiceForUser`
(чужой счёт → `notFound`). Канал/тип записи — те же, что в Session 15:
`channel="whatsapp"`, `type="payment_reminder"`, `status="prepared"`.

## Расчёт остатка долга

Долг — материализованный кэш `Debt` (per-invoice, `unique invoiceId`),
консистентен в рамках транзакций `createInvoice`/`addPayment`/`cancelInvoice`
(см. [FINANCE.md](FINANCE.md)). `OPEN_DEBT_STATUSES = ["open", "partial"]` —
именно эти статусы попадают в очередь; `closed`/`written_off` (полностью
оплаченные/отменённые счета) исключены автоматически фильтром, без
дополнительной проверки `invoice.status` в запросе.

## Permissions

| Действие | Право | Доп. проверка |
|---|---|---|
| Просмотр `/finance/debts` | `finance.view` | scope по пациенту (`patientScopeWhere`) — как `/finance` |
| `prepareInvoiceReminder` (кнопка в очереди) | `finance.manage` | `getInvoiceForUser` — счёт в scope |

Пользователь без `finance.view` (assistant в дефолтной матрице ролей) —
`/finance/debts` редиректит на `/dashboard` (как и `/finance`). Пользователь
с `finance.view`, но без `finance.manage` (doctor, reception) видит очередь,
но кнопка не рендерится.

## Не входит в v1

WhatsApp Business API / реальная отправка, SMS/email-провайдер, online
payment gateway, online payment link, редизайн finance-модуля, accounting
module, subscription billing, patient portal, cron-автоматизация
напоминаний (очередь — ручная, сотрудник сам решает, когда зайти на
`/finance/debts` и подготовить сообщение).

## E2E

`npx tsx scripts/e2e-debt-reminders-check.ts` — кандидаты очереди (unpaid/
partial), сортировка по остатку, полностью оплаченный счёт не попадает в
очередь и действие его отклоняет (`fullyPaid`), отсутствие телефона
блокирует подготовку без создания записи, успешная подготовка обновляет
`lastReminderAt` и пишет `Notification`, permission-гейт (assistant),
tenant-изоляция (чужой счёт другой клиники).

## Future

Online payment links, scheduled/cron debt reminders, finance reports v2
(динамика долга по периодам), реальная отправка через WhatsApp Business API.
