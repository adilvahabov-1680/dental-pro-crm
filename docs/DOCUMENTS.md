# Dental Pro CRM — Модуль Sənədlər / PDF Documents
**by AV Systems** · v1.3 · Сессии 11 (блок), 12 (PDF), 14 (загрузка), 14.5 (soft-delete), 19 (клинические привязки, превью, cleanup)
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

## Soft-delete загруженных документов (сессия 14.5)

- `deleteUploadedDocument` (lib/actions/documents.ts): documents.manage →
  tenant + patient-scope (id из формы, clinicId ТОЛЬКО из сессии) →
  `deletedAt = now` → audit_log (`delete document`) → revalidate. Повторное
  удаление идемпотентно (`{ deleted: true }`); чужой/несуществующий —
  notFound без утечки.
- **Физический файл в v1 остаётся на диске** — удаляется только запись
  (восстановление возможно через БД). Future: cleanup-job для deleted/orphan
  файлов.
- Удалённые скрыты во всех списках (`deletedAt: null` в listDocuments /
  listPatientDocuments / listPatientDocumentRecords) и **не скачиваются**
  (getUploadedDocumentForUser фильтрует deletedAt → download 404).
- UI: кнопка «Sil» (confirm) — только для kind=upload при documents.manage;
  `pdf_records` не удаляются (append-only), у них кнопки нет. Restore-UI и
  bulk delete не делались.

## Клинические привязки: зуб / процедура (сессия 19)

Таблица **documents** уже содержала `toothRecordId` / `treatmentItemId`
(schema не менялась) — в v1.3 они используются:

- **Форма загрузки** (`UploadDocumentForm`): два опциональных select'а —
  «Dişlə əlaqələndir» (зубы пациента из ToothRecord) и «Müalicə ilə
  əlaqələndir» (процедуры пациента из TreatmentItem, с номером зуба в
  лейбле). Без выбора — «Əlaqəsiz sənəd» (toothRecordId/treatmentItemId =
  null). Опции — `listPatientLinkOptions` (lib/documents.ts), tenant +
  patient-scope.
- **Валидация** (`uploadPatientDocument`, lib/actions/documents.ts):
  привязка проверяется server-side — зуб/процедура должны принадлежать
  тому же пациенту (и tenant'у через `tenantClient`); иначе
  `invalidTooth` / `invalidTreatment`.
- **Бейджи привязки** — везде, где документ показывается в общих списках
  (`/documents`, `/patients/[id]/documents`, PatientDocumentsBlock):
  «Diş 16» / «Müalicə: <название услуги>».
- **Контекст зуба** (ToothPanel на `/patients/[id]/dental-chart`):
  блок «привязанные документы» под историей зуба — список с заголовком,
  датой и ссылкой «Aç» (открывает download route).
- **Контекст процедуры** (`/treatments/[id]/materials`): отдельная
  карточка с привязанными документами, аналогично ToothPanel.
- Источник данных: `listToothRecordDocuments`, `listTreatmentItemDocuments`
  (lib/documents.ts) — оба tenant + scope, `deletedAt: null`.

⚠️ **Важный фикс валидации**: если у пациента нет ни одного зуба/процедуры,
соответствующий `<select>` не рендерится — браузер не отправляет это поле,
`formData.get()` возвращает `null`. `uploadDocumentSchema` (lib/validation/documents.ts)
оборачивает `toothRecordId`/`treatmentItemId` в `z.preprocess` (`null → ""`)
перед `.optional().or(z.literal(""))` — без этого **любая** загрузка файла
такому пациенту падала с ошибкой `patientNotFound`. Затронуто с сессии 14
(до 19 баг не проявлялся, т.к. select'ов не было вовсе).

## Превью изображений (сессия 19)

В списках документов (`/documents`, `/patients/[id]/documents`,
PatientDocumentsBlock) для `mimeType` `image/png|jpeg|webp` рядом с записью
рендерится `<img src="/api/documents/[id]/download">` (миниатюра) — download
route уже отдавал `Content-Disposition: inline` для изображений, доп.
эндпоинт не нужен. Клик/«Aç» открывает оригинал в новой вкладке. PDF — без
превью (как раньше, через iframe на `/documents/[id]`).

## Cleanup физических файлов (сессия 19)

`scripts/cleanup-deleted-documents.ts` — отдельный, безопасный скрипт для
удаления **физических файлов** soft-deleted записей `documents` (записи в
БД не трогаются, `pdf_records` не затрагиваются):

```
npx tsx scripts/cleanup-deleted-documents.ts            # dry-run (по умолчанию)
npx tsx scripts/cleanup-deleted-documents.ts --execute  # реально удалить файлы
```

Без cron — запуск вручную/по плану. Path-traversal-safe (та же логика, что
`resolveUploadPath` в lib/storage.ts); небезопасные пути пропускаются с
пометкой.

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

## Storage (lib/storage.ts, driver-абстракция с сессии 91)

Ключ (то же, что раньше было «relative path»): `documents/{clinicId}/{patientId}/{type}-{дата}-{random}.pdf`;
в БД — только этот ключ, без изменений по сравнению с v1.3. Имя файла
генерируется системой (без user input).

Два драйвера через `STORAGE_DRIVER`:
- `local` (дефолт) — локальный диск `uploads/`; `resolveUploadPath` отсекает
  absolute paths и `../` (path traversal). `uploads/` в .gitignore —
  бинарники в репозиторий не попадают. Подходит для self-hosted/VPS и для
  dev/e2e — поведение не изменилось.
- `s3` — S3-совместимое хранилище (Cloudflare R2 / AWS S3 / MinIO) через
  `@aws-sdk/client-s3`. **Нужен на serverless** (Vercel/Netlify) — там
  локальный диск эфемерен/недоступен на запись (подтверждено эмпирически
  в сессии 89; до сессии 91 это было известное, честно заявленное
  ограничение v1). Настройка — см. [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md) §9.

Публичные функции (`saveUploadFile`/`readUploadFile`/`resolveUploadPath`)
не изменили сигнатуру — весь код-потребитель (генерация PDF, загрузка
документов, лого клиники, аватар, подпись врача) работает одинаково
независимо от выбранного драйвера. Добавлены `existsUploadFile`/
`deleteUploadFile` (раньше их не было — `scripts/cleanup-deleted-documents.ts`
держал собственную копию `resolveUploadPath`, теперь использует абстракцию).

Безопасность не зависит от драйвера: mime пересниффается по байтам на
чтении (никогда не доверяем сохранённому типу), raw-ключ никогда не
передаётся клиентским компонентам — только через уже существующие
авторизованные API-routes; S3-бакет должен быть приватным (без public
read), приложение само проксирует байты через эти routes.

Миграция БД для переключения драйвера НЕ требуется — `Document.fileUrl`/
`PdfRecord.fileUrl` (и аналогично `Clinic.logoUrl`/`User.avatarUrl`/
`Doctor.signatureUrl`) уже были opaque-строками, без файловой семантики
на уровне схемы.

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

`npx tsx scripts/e2e-file-uploads-check.ts` — 39 проверок: загрузка PDF/PNG,
soft-delete (скрытие в 3 списках, download 404, идемпотентность, файл на диске,
права/cross-tenant),
sniff mime (octet-stream → image/png; скрипт-подделка отклонена), серверное имя
файла, байты на диске и в download, лимит 10 MB, traversal-имя, блок пациента,
`/documents` + фильтр, doctor scope, assistant (manage/view), cross-tenant
upload/download. Cleanup удаляет записи и файлы.

## E2E клинических привязок (сессия 19)

`npx tsx scripts/e2e-document-clinical-links-check.ts` — 19 проверок:
загрузка с привязкой к зубу/процедуре, бейджи «Diş N» / «Müalicə: ...» в
PatientDocumentsBlock, `/patients/[id]/documents`, `/documents`, отображение
в ToothPanel и на странице материалов процедуры, cross-patient/cross-tenant
отклонение привязки, PNG-превью (content-type, `<img>`), soft-delete (скрытие
+ файл на диске остаётся до cleanup). Cleanup удаляет e2e-документы, файлы и
временную клинику B.

## Не входит в v1.3

Отправка пациенту (email/WhatsApp/SMS), электронная подпись (юридическая —
визуальная подпись врача в «Müalicə çıxarışı» сделана в сессии 87),
редактор шаблонов, «Pasiyent məlumat forması» (кнопка с Tezliklə),
restore-UI / hard delete / bulk delete, редактирование загруженных
документов, OCR, аннотирование изображений, DICOM-просмотр, версии
документов, mass upload / drag-and-drop, Office-форматы, брендирование PDF
логотипом клиники.

~~S3-storage~~ ✅ сделано в сессии 91 (`STORAGE_DRIVER=s3`, см. §Storage
выше) — для использования на serverless нужна явная настройка бакета/ключей,
сам по себе драйвер не активируется.

## Next step

Отправка PDF/напоминаний пациенту (WhatsApp/SMS), либо автоматизация cleanup
(cron) для физических файлов soft-deleted документов — по приоритету заказчика.
