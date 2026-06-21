# Dental Pro CRM — Модуль Maliyyə (Finance)
**by AV Systems** · v1.1 · Сессии 9, 11
Связанные документы: [DATABASE.md](DATABASE.md) §F · [TREATMENTS.md](TREATMENTS.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Routes

| Маршрут | Содержимое |
|---|---|
| `/finance` | summary-карточки (Ümumi hesablar / Ödənilib / Qalıq borc / Bu ay ödənişlər) + список счетов + фильтры (пациент, статус, врач для админ-ролей) |
| `/finance/invoices/new` | без `?patientId` — выбор пациента; с ним — чекбоксы billable-процедур с живой суммой |
| `/finance/invoices/[id]` | состав счёта, итоги, остаток, история оплат, форма оплаты (manage) |
| `/finance/debts` | очередь debt reminder (сессия 47) — открытые/частичные долги клиники, кнопка «Ödəniş xatırlatması hazırla»; подробности — [DEBT_REMINDERS.md](DEBT_REMINDERS.md) |
| `/patients/[id]/finance` | все счета и оплаты пациента, итоги, кнопка «Hesab yarat» |
| `/patients/[id]` | живой блок «Ödənişlər»: итоги, debt-бейдж, последние 3 счёта/оплаты |

## Models (schema.prisma НЕ менялась)

Маппинг отличий от ТЗ: `invoiceNumber` → `number Int` + `unique(clinicId,number)`, отображение `INV-000001`; `issuedAt` → `createdAt`; `balanceAmount` — вычисляется (`total − paidAmount`); `createdById` → audit_logs; зуб/услуга в InvoiceItem — внутри `description` («Kariyes müalicəsi · Diş 16»), `treatmentItemId` хранит связь. **Debt — per-invoice** (unique `invoiceId`), долг пациента = Σ долгов со статусом open/partial. PaymentMethod: `transfer` = «Bank köçürməsi» (+`installment` из схемы). `Debt.lastReminderAt` — заполняется с сессии 47 (см. [DEBT_REMINDERS.md](DEBT_REMINDERS.md)); до этого поле существовало в схеме, но ничего его не записывало.

## Invoice lifecycle

`issued` (создание из done-процедур) → `partially_paid` (первая оплата) → `paid` (остаток 0); `cancelled` — отмена счёта (сессия 11, см. ниже); по cancelled оплаты не принимаются. Создание: только процедуры **status=done, invoiceId=null, этого пациента, этой клиники** — server action пересчитывает выборку по ids из формы и отклоняет несовпадение (двойное выставление/чужие/не-done невозможны). При создании: invoice + invoice_items + `treatment_items.invoiceId` + debt(open) — в одной транзакции.

## Cancel invoice (сессия 11)

`cancelInvoice` (lib/actions/finance.ts) + `CancelInvoiceButton` на странице счёта.
Правила v1:

- отменить можно только счёт **без единой оплаты** (`paidAmount = 0` и нет
  payments); счёт с оплатой → ошибка «Ödənişi olan hesab v1-də ləğv edilə
  bilməz…» (нужен будущий модуль возвратов), кнопка не показывается;
- требуется `finance.manage`; чужой счёт (tenant/scope) → invoiceNotFound;
- та же блокировка `'payment:'+invoiceId`, что у addPayment — закрывает гонку
  «оплата во время отмены»; статус и количество payments перепроверяются в
  транзакции;
- при отмене: `invoice.status = cancelled` (строка НЕ удаляется),
  `debt → amount 0, written_off`, `treatment_items.invoiceId = null`
  (процедуры снова billable), invoice_items остаются историческими строками,
  payments не трогаются (append-only); audit_log (update invoice);
- summary/долги считаются с `status != cancelled` — отменённый счёт выпадает
  из итогов автоматически.

## Payment lifecycle / частичные оплаты

Payment — **append-only** (не редактируется, не удаляется; сторно по DATABASE.md — будущей записью с минусом). Частичные оплаты разрешены; **переплата запрещена** (amount ≤ остатка, v1). После каждой оплаты в той же транзакции: `paidAmount`/`status` счёта + debt (`amount = total − paid`, partial/closed).

## Invoice numbering (риск DATABASE.md §9.2 закрыт)

Интерактивная транзакция + `pg_advisory_xact_lock(hashtext('invoice:'+clinicId))` → `max(number)+1` → insert. Параллельные создания сериализуются по клинике; `unique(clinic_id, number)` — страховка. Оплаты так же сериализуются по счёту (`'payment:'+invoiceId`). Внутри транзакций — базовый prisma с явным clinicId (tenant подтверждён выборками до записи).

## Permissions / Tenant

`finance.view/manage` существовали: owner/admin/accountant — view+manage; **doctor и reception — только view** (видят, счета создаёт админ/бухгалтер); assistant — ничего. Scope — по пациенту (как treatments). Чужой счёт/пациент → 404 без утечки; server actions перепроверяют всё (форме не доверяют); audit_log на invoice create и payment create.

## Связь с Treatment

`treatment_items.invoiceId` ставится при выставлении; карточка процедуры показывает бейдж «INV-… » со ссылкой; кнопка «Hesab yarat» на странице лечения пациента (только finance.manage). Статусная логика Treatment не менялась.

## Не входит в v1

PDF счёта/чека (заготовка: `pdf_records.invoice_pdf`), возвраты (отрицательный payment поддержан схемой) и отмена счёта с оплатами, скидка на уровне счёта (только на процедуре), авансы (`payment.invoiceId=null` поддержан схемой), рассрочка-графики, отчёты/экспорт.

## Known risks

Ошибочный счёт **с оплатами** по-прежнему исправляется только через БД (до модуля возвратов); debt-кэш консистентен в рамках транзакций, но прямые правки БД его рассинхронизируют (истина — invoices/payments, DATABASE.md §F.21); advisory lock работает в пределах одной PostgreSQL (ок до мульти-инстансов БД).

## Next step

**Anbar (Inventory)**: материалы, категории (seed готов), приход/расход, min_quantity-предупреждения, связь `treatment_item_materials` со списанием при done.

## Проверка

`npx tsx scripts/e2e-finance-check.ts` (нужен dev-сервер + seed). Debt
reminder queue/действие — отдельный скрипт,
`npx tsx scripts/e2e-debt-reminders-check.ts` (см. [DEBT_REMINDERS.md](DEBT_REMINDERS.md)).
