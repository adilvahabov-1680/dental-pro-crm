# Dental Pro CRM — Модуль Sənədlər / PDF Documents
**by AV Systems** · v1.1 · Сессии 11 (блок), 12 (PDF-генерация), 14 (загрузка файлов)
Связанные документы: [DATABASE.md](DATABASE.md) §H · [FINANCE.md](FINANCE.md) · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md)

## Типы документов v1

| Тип (PdfType) | Метка AZ | Источник | Кнопка |
|---|---|---|---|
| `extract` | Müalicə çıxarışı | пациент: данные, процедуры (до 15, без cancelled), активные статусы зубов, рекомендации | карточка пациента / `/patients/[id]/documents` |
| `invoice_pdf` | Hesab sənədi | счёт: позиции, итоги, оплаты | страница счёта `/finance/invoices/[id]` |

Реестр — **pdf_records** (append-only): type, sourceEntity/sourceId, fileUrl,
generatedById. Номер в шапке PDF (`SND-000001`) — косметический
(count+1 на момент генерации, в БД не хранится).

## Загрузка файлов пациента (сессия 14)

Таблица **documents** (schema не менялась): patientId, type (enum DocumentType:
`xray | consent | photo | contract | other`, AZ-метки — DOCUMENT_TYPE_META),
title, fileUrl (relative), mimeType, fileSize, uploadedById, deletedAt.

- **Лимиты v1**: ≤ 10 MB (`UPLOAD_MAX_BYTES`); mime: PDF, JPEG, PNG, WebP
  (Office-форматы отложены сознательно). `serverActions.bodySizeLimit: "12mb"`
  в next.config.ts (дефолт 1 MB не пропустил бы файл).
- **Mime по магическим байтам** (`sniffUploadMime`) — клиентскому mime/имени
  не доверяем; подделка заголовка (скрипт как .pdf) отклоняется. В БД
  сохраняется sniffed mime.
- **Имя на диске генерируется сервером**: `{type}-{дата}-{random}.{ext}` в
  `uploads/documents/{clinicId}/{patientId}/uploaded/`; оригинальное имя файла —
  только как title по умолчанию (sanitizeOriginalName: без путей/управляющих
  символов). Отдельной колонки originalFileName в схеме нет — принято для v1.
- Поток: `uploadPatientDocument` (lib/actions/documents.ts) — documents.manage →
  getPatientForUser (tenant+scope) → размер → sniff → saveUploadFile →
  document → audit_log (`create document`) → revalidate. Форма остаётся на
  странице (`uploadedId` в state).
- UI: форма «Sənəd yüklə» в PatientDocumentsBlock (компакт) и на
  `/patients/[id]/documents`; списки `/documents` и пациента показывают оба
  вида через `DocumentListRow` (kind `pdf` | `upload`; у загруженных — иконка
  Paperclip и прямое скачивание).

## Routes

| Маршрут | Содержимое |
|---|---|
| `/documents` | PDF + загруженные файлы, фильтры (тип — оба enum'а, пациент, дата) |
| `/documents/[id]` | мета + iframe-превью + «PDF aç» (только pdf_records); отсутствующий файл → fileMissing |
| `/patients/[id]/documents` | история документов пациента + генерация + форма загрузки |
| `/patients/[id]` | блок «Sənədlər»: генерация çıxarış, загрузка файла, последние 5 записей |
| `/api/documents/[id]/download` | отдача файла с собственной проверкой доступа: id сначала ищется в pdf_records (контракт v1 не менялся), затем в documents; Content-Type из записи; inline для PDF/изображений, attachment для прочего |

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

## E2E загрузки файлов

`npx tsx scripts/e2e-file-uploads-check.ts` — 27 проверок: загрузка PDF/PNG,
sniff mime (octet-stream → image/png; скрипт-подделка отклонена), серверное имя
файла, байты на диске и в download, лимит 10 MB, traversal-имя, блок пациента,
`/documents` + фильтр, doctor scope, assistant (manage/view), cross-tenant
upload/download. Cleanup удаляет записи и файлы.

## Не входит в v1.1

Отправка пациенту (email/WhatsApp/SMS), электронная подпись, редактор шаблонов,
«Pasiyent məlumat forması» (кнопка с Tezliklə), удаление/редактирование
загруженных документов из UI, привязка файла к зубу/процедуре (toothRecordId /
treatmentItemId в схеме есть), preview-сетка изображений, mass upload /
drag-and-drop, Office-форматы, брендирование PDF логотипом клиники, S3-storage
(**локальный диск не подходит для serverless** — lib/storage.ts остаётся
единственной точкой замены на S3-совместимый слой).

## Next step

Отправка PDF/напоминаний пациенту (WhatsApp/SMS) или привязка загруженных
файлов к зубу/процедуре — по приоритету заказчика.
