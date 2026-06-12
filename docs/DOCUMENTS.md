# Dental Pro CRM — Модуль Sənədlər / PDF Documents
**by AV Systems** · v1.0 · Сессии 11 (блок), 12 (PDF-генерация)
Связанные документы: [DATABASE.md](DATABASE.md) §H · [FINANCE.md](FINANCE.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Типы документов v1

| Тип (PdfType) | Метка AZ | Источник | Кнопка |
|---|---|---|---|
| `extract` | Müalicə çıxarışı | пациент: данные, процедуры (до 15, без cancelled), активные статусы зубов, рекомендации | карточка пациента / `/patients/[id]/documents` |
| `invoice_pdf` | Hesab sənədi | счёт: позиции, итоги, оплаты | страница счёта `/finance/invoices/[id]` |

Реестр — **pdf_records** (append-only): type, sourceEntity/sourceId, fileUrl,
generatedById. Таблица `documents` (загрузка файлов: снимки, согласия) — следующая
фаза; её записи уже показываются в блоке пациента. Номер в шапке PDF
(`SND-000001`) — косметический (count+1 на момент генерации, в БД не хранится).

## Routes

| Маршрут | Содержимое |
|---|---|
| `/documents` | список PDF клиники + фильтры (тип, пациент, дата) |
| `/documents/[id]` | мета + iframe-превью + «PDF aç»; отсутствующий файл → fileMissing-карточка |
| `/patients/[id]/documents` | история документов пациента + кнопка генерации |
| `/patients/[id]` | блок «Sənədlər»: генерация чыxarış, ссылка на финансы, последние 5 записей |
| `/api/documents/[id]/download` | отдача PDF (inline) с собственной проверкой доступа |

## Генерация (lib/pdf.ts, lib/actions/documents.ts)

pdfkit + **DejaVu Sans** (npm `dejavu-fonts-ttf`) — стандартные PDF-шрифты не
содержат ə/ş/ğ. `serverExternalPackages: ["pdfkit"]` в next.config.ts обязателен
(webpack ломает пути к data-файлам pdfkit); дефолтный Helvetica не загружается
(`font:` в конструкторе). Деньги в PDF — «AZN» (знак ₼ есть не во всех шрифтах).

Поток: permission → scope (getPatientForUser / getInvoiceForUser) → данные →
рендер в Buffer → файл в storage → pdf_record → audit_log → redirect на
`/documents/[id]`. Если запись не создалась — остаётся осиротевший файл
(не критично); если файл пропал — download вернёт 404, страница покажет
fileMissing (graceful).

## Storage (lib/storage.ts)

Локальный диск: `uploads/documents/{clinicId}/{patientId}/{type}-{дата}-{random}.pdf`;
в БД — только relative path. Имя файла генерируется системой (без user input).
`resolveUploadPath` отсекает absolute paths и `../` (path traversal).
`uploads/` в .gitignore — бинарники в репозиторий не попадают.

**Ограничение production**: локальный диск подходит для self-hosted/VPS.
На serverless (Vercel/Netlify) файловая система эфемерна — перед таким деплоем
lib/storage.ts заменяется на S3-совместимый слой (единственная точка замены).
Это НЕ решено в v1 и заявлено честно.

## Permissions / Tenant

- `documents.view` — открыть список/страницу/скачать (doctor, reception,
  accountant, owner/admin); assistant по умолчанию — нет;
- `documents.manage` — генерация (doctor, owner/admin). Accountant генерировать
  hesab-PDF по умолчанию не может (нет manage) — при необходимости выдаётся
  через user_permissions;
- scope — по пациенту: врач видит/генерирует только для своих пациентов,
  чужой пациент/счёт/документ → 404/ошибка без утечки;
- download route проверяет доступ независимо от страницы (сессия → view →
  tenant/scope), фронтовая ссылка не является границей доверия;
- audit_log: `create pdf_record` на каждую генерацию.

## E2E

`npx tsx scripts/e2e-documents-check.ts` — 36 проверок: генерация обоих типов,
содержимое PDF (через pdf-parse: имя пациента, процедуры, номер счёта, итоги),
файл в uploads/, download route, изоляция tenant/scope (owner/doctor/assistant),
missing file, audit. Cleanup удаляет e2e-документы и файлы.

## Не входит в v1

Отправка пациенту (email/WhatsApp/SMS), электронная подпись, редактор шаблонов,
загрузка файлов в `documents` (снимки/согласия), «Pasiyent məlumat forması»
(кнопка с Tezliklə), брендирование PDF логотипом клиники (logoUrl в схеме есть),
S3-storage.

## Next step

**Settings / Clinic profile**: реквизиты клиники (адрес/телефон/логотип попадают
в шапку PDF), прайс услуг, рабочие часы — последний placeholder-модуль.
