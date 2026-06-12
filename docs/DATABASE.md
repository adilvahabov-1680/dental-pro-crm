# Dental Pro CRM — Database Schema & Module Architecture
**by AV Systems** · v0.3 (Session 3) · 2026-06-11
Связанные документы: [PROJECT.md](PROJECT.md) · [DESIGN.md](DESIGN.md) · [DENTAL_CHART.md](DENTAL_CHART.md)
Реализация (источник правды): [prisma/schema.prisma](../prisma/schema.prisma) — **валидирована Prisma CLI**

> **Changelog v0.3:** + `user_permissions`, `dental_charts`, `service_categories`, `inventory_categories`, `settings`, `translations`; расширены `tooth_records`, `tooth_history`, `appointments`, `patient_response_links`, `supplier_orders`; ToothStatus 10→13, AppointmentStatus 7→11; `clinics.settings json` заменён таблицей `settings`. Ничего не переименовано и не удалено, кроме этой json-заглушки.

---

## 0. Конвенции (все таблицы)

| Правило | Значение |
|---------|----------|
| PK | `id uuid` (не перебираемые) |
| Tenant | `clinic_id uuid FK → clinics` — обязателен в каждой бизнес-таблице |
| Деньги | `int` в гяпиках; валюта — настройка клиники |
| Время | `timestamptz`, в БД UTC |
| Timestamps | `created_at` везде; `updated_at` везде, кроме append-only (⛔) |
| Soft delete | `deleted_at`; ⛔-таблицы не изменяются и не удаляются вовсе |
| **R/O** | required / optional |

---

## 1. Полная схема (33 сущности + 5 поддерживающих)

### A. Tenancy & Access

#### 1. `clinics`
id R · name R · slug R unique · phone/email/address O · timezone R (`Asia/Baku`) · currency R (`AZN`) · default_locale R enum Locale(`az·ru·en`) · logo_url O · status R enum(`trial·active·suspended`) · plan O · timestamps · soft delete ✔
Настройки клиники — в таблице `settings` (scope=clinic), не json-полем. Соло-врач = клиника из одного пользователя — структура едина.

#### 2. `users`
id R · **clinic_id O** (null только у super_admin) · role_id R FK→roles · email R unique · phone O · password_hash R · full_name R · locale R · avatar_url O · is_active R · last_login_at O · timestamps · soft delete ✔

#### 3. `roles`
id R · clinic_id O (null = системная seed-роль) · key R enum RoleKey(`super_admin·owner·admin·doctor·reception·assistant·accountant`) · name R (i18n-ключ) · is_system R · unique(clinic_id, key)

#### 4. `permissions` + `role_permissions` (supporting)
`permissions`: id R · key R unique (`patients.view`, `finance.manage`, …) · module R · description O. Глобальный seed-каталог.
`role_permissions`: role_id + permission_id (composite PK).

#### 5. `user_permissions` — индивидуальные права **(new v0.3)**
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| user_id | uuid | R | FK → users (composite PK) |
| permission_id | uuid | R | FK → permissions (composite PK) |
| allowed | bool | R | true = выдано сверх роли; **false = явный запрет поверх роли** |
| granted_by | uuid | O | FK → users (кто выдал) |

**Итоговые права = role_permissions ∪ (user_permissions allowed=true) − (user_permissions allowed=false).** Так врачу можно «дать дополнительные права», а ассистенту — точечно открыть/закрыть разделы.

#### 6. `doctors`
id R · clinic_id R · user_id R unique FK→users · specialty O (вкл. uşaq stomatoloqu) · license_no O · color R (календарь) · commission_percent O · working_hours O json · is_active R · timestamps · soft delete ✔

#### 7. `assistants`
id R · clinic_id R · user_id R unique · assigned_doctor_id O FK→doctors · is_active R · timestamps · soft delete ✔. Доступ к разделам — через роль + `user_permissions`.

---

### B. Patients & Appointments

#### 8. `patients`
id R · clinic_id R · primary_doctor_id O FK→doctors · **guardian_id O self-FK→patients** (опекун ребёнка) · first_name R · last_name R · father_name O · **birth_date O** (возраст → тип карты) · gender O · phone O* (взрослый — R на уровне приложения; ребёнок — через опекуна) · email/address O · allergies O (warning-бейдж) · chronic_diseases/anamnesis/notes/source O · status R enum(`active·archived`) · timestamps · soft delete ✔

#### 9. `appointments` (v0.3: + ответ пациента и правила отмены)
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| id, clinic_id, patient_id, doctor_id | uuid | R | FK |
| assistant_id, service_id | uuid | O | FK; service = основная услуга визита |
| starts_at, ends_at | timestamptz | R | duration **не хранится** — вычисляется (нет рассинхрона) |
| status | enum | R | см. §1-B-10 |
| complaint, chair, notes | text | O | |
| patient_response_status | enum | R | `pending·confirmed·running_late·reschedule_requested·cancelled` — кэш ответа по ссылке |
| cancellation_deadline | timestamptz | O | отмена позже дедлайна → `late_cancelled` + `late_cancel_flag` |
| reschedule_allowed | bool | R | default true |
| late_cancel_flag | bool | R | default false |
| reminder_sent_at | timestamptz | O | |
| created_by | uuid | R | FK → users |

timestamps · soft delete ✔ · clinic_id ✔ doctor_id ✔ patient_id ✔

#### 10. Статусы приёма — enum `AppointmentStatus`, **не таблица**
Workflow, напоминания и отчёты зависят от конкретных статусов; редактируемый клиниками справочник сломал бы логику. AZ-названия — i18n-ключи.

| Ключ | AZ |
|---|---|
| scheduled | yaradıldı |
| notified | bildiriş göndərildi |
| confirmed | təsdiqləndi |
| arrived / in_progress | (внутренние: пришёл / в кресле) |
| running_late | gecikir |
| reschedule_requested | vaxt dəyişmə sorğusu |
| completed | tamamlandı |
| no_show | gəlmədi |
| cancelled | ləğv edildi |
| late_cancelled | təcili ləğv |

---

### C. Dental Chart (ядро продукта)

#### 11. `dental_charts` **(new v0.3)** — карта как контейнер
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| id, clinic_id, patient_id | uuid | R | FK |
| chart_type | enum ChartType | R | `adult · child` |
| is_active | bool | R | |
| notes | text | O | |

**unique(clinic_id, patient_id, chart_type)** — у пациента максимум одна карта каждого типа. Взрослая создаётся лениво при первом открытии; детская — будущая версия (ни одной новой таблицы не потребует). timestamps · soft delete ✔

#### 12. `tooth_records` — каждый зуб = отдельная запись
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| id, clinic_id, patient_id | uuid | R | FK |
| dental_chart_id | uuid | R | FK → dental_charts |
| doctor_id | uuid | O | последний лечащий врач по зубу |
| tooth_number | smallint | R | FDI: взрослые 11–18, 21–28, 31–38, 41–48; молочные 51–85 |
| dentition | enum | R | `permanent · primary` (tooth_type adult/child) |
| status | enum ToothStatus | R | default `healthy`; 13 статусов (ниже) |
| priority | enum | R | `low · normal · high · urgent` |
| diagnosis | text | O | |
| doctor_notes | text | O | treatment note врача |
| last_treated_at | timestamptz | O | |
| updated_by | uuid | R | FK → users |

**unique(dental_chart_id, tooth_number)** + index(clinic_id, patient_id, tooth_number). Зуб без записи = sağlam. timestamps · soft delete ✔ (v0.3; история при этом остаётся)

#### Enum `ToothStatus` (13)
`healthy` Sağlam · `needs_treatment` Müalicə tələb edir · `in_treatment` Müalicə olunur · `completed` Tamamlandı · `implant` İmplant · `extracted` Çıxarılıb · `root_canal` Kanal müalicəsi · `filling` Plomba · `crown` Tac/Koronka · `observation` Müşahidə · **`temporary_filling`** Müvəqqəti plomba · **`crown_needed`** Tac lazımdır · **`extraction_planned`** Çıxarılma planlaşdırılıb

#### 13. `tooth_history` ⛔ append-only (v0.3: + явные поля)
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| id, clinic_id, patient_id | uuid | R | |
| tooth_record_id | uuid | O | FK |
| tooth_number | smallint | R | денормализован — история живёт независимо |
| change_type | enum | R | `status_changed · diagnosis_changed · procedure_added · note_changed` |
| **previous_status / new_status** | enum ToothStatus | O | явные поля для ленты |
| **diagnosis / procedure_done / doctor_note** | text | O | |
| before / after | jsonb | O | полный снимок для аудита |
| changed_by | uuid | R | FK → users |
| created_at | timestamptz | R | update/delete запрещены |

История ведётся **по каждому зубу отдельно**; молочный (51) и постоянный (11) — разные tooth_number, не смешиваются.

---

### D. Treatment

#### 14. `treatment_plans`
id R · clinic_id R · patient_id R · doctor_id R · title R · status R enum(`draft·proposed·approved·in_progress·completed·cancelled`) · total_price R (кэш) · notes O · approved_at O (согласие пациента/опекуна) · timestamps · soft delete ✔

#### 15. `treatment_items` (= процедуры)
id R · clinic_id R · patient_id R · doctor_id R · treatment_plan_id O (null = разовая) · tooth_record_id O · tooth_number O (null = не по зубу) · service_id R FK→services · status R enum(`planned·in_progress·done·cancelled`) · price R · discount R · surfaces O (резерв: M/D/O/B/L) · appointment_id O · invoice_id O · performed_at O · notes O · timestamps · soft delete ✔
Диагноз — на `tooth_records`; материалы — `treatment_item_materials`; оплата — через invoice.

#### 15a. `treatment_item_materials` (supporting)
clinic_id R · treatment_item_id R · inventory_item_id R · quantity R · unit_cost R. При `done` → `inventory_movement(out)`. **Связь зуб ↔ материалы ↔ склад.**

---

### E. Services & Prices

#### 16. `service_categories` **(new v0.3)**
id R · clinic_id R · name R (terapiya, ortopediya, cərrahiyyə, uşaq stomatologiyası) · sort_order R · is_active R · timestamps · soft delete ✔

#### 17. `services`
id R · clinic_id R · **category_id O FK→service_categories** (заменил строку category) · name R · code O · duration_min O · is_child_service R · is_active R · timestamps · soft delete ✔

#### 18. `prices` ⛔ append-only — история цен
id R · clinic_id R · service_id R · price R · child_price O · valid_from R · valid_to O (**null = действующая**). Смена цены = закрыть старую запись + создать новую; старые счета не пересчитываются.

---

### F. Finance

#### 19. `invoices`
id R · clinic_id R · patient_id R · doctor_id O · appointment_id O · number R (unique per clinic, выдаётся в транзакции) · status R enum(`draft·issued·partially_paid·paid·cancelled`) · subtotal/discount/total R · paid_amount R (кэш) · due_date O · notes O · timestamps · soft delete ✔
`invoice_items` (supporting): invoice_id R · treatment_item_id O · description R · qty/unit_price/total R.

#### 20. `payments` ⛔ append-only
id R · clinic_id R · patient_id R · invoice_id O (null = аванс) · amount R (отрицательный = возврат; **частичная оплата = просто payment меньше total**) · method R enum(`cash·card·transfer·installment·other`) · paid_at R · received_by R · notes O

#### 21. `debts` — материализованный остаток
id R · clinic_id R · patient_id R · invoice_id R unique · amount R (= total − Σpayments, пересчёт при оплате) · status R enum(`open·partial·closed·written_off`) · due_date O · last_reminder_at O · timestamps
Истина — invoices/payments; debts — кэш для списка должников и напоминаний.

---

### G. Inventory

#### 22. `inventory_categories` **(new v0.3)**
id R · clinic_id R · name R · is_active R · timestamps · soft delete ✔

#### 23. `inventory_items`
id R · clinic_id R · **category_id O FK** · name R · sku O · unit R (ədəd/ml/qr/qutu) · quantity R (кэш остатка) · **min_quantity R** (порог → notification `inventory_low_stock`) · unit_cost O · supplier_id O · **expires_at O** (срок годности) · is_active R · timestamps · soft delete ✔

#### 24. `inventory_movements` ⛔ append-only
id R · clinic_id R · inventory_item_id R · type R enum(`in·out·adjustment·write_off`) · quantity R · unit_cost O · reason O · treatment_item_id O (расход на лечение) · supplier_order_id O (приход) · performed_by R

#### 25. `suppliers`
id R · clinic_id R · name R · contact_name/phone/email/address/notes O · is_active R · timestamps · soft delete ✔

#### 26. `supplier_orders` (v0.3: + email-черновик)
id R · clinic_id R · supplier_id R · number R · status R enum(`draft·ordered·received·cancelled`) · total_cost R · ordered_at/received_at O · **email_draft O** (текст письма) · **email_sent_at O** (null = не отправлено) · **created_by R** · notes O · timestamps · soft delete ✔
`supplier_order_items` (supporting): order_id R · inventory_item_id R · quantity R · unit_cost R. При `received` → movements `in`.

---

### H. Documents & Communication

#### 27. `documents`
id R · clinic_id R · patient_id O · tooth_record_id O (снимок зуба) · treatment_item_id O · type R enum(`consent·xray·photo·contract·other`) · title R · file_url R (префикс `clinic_id/`) · mime_type/file_size R · signed_by_guardian R (детское согласие) · uploaded_by R · timestamps · soft delete ✔

#### 28. `pdf_records` ⛔ append-only (v0.3: + 2 типа)
id R · clinic_id R · patient_id O · type R enum(`invoice_pdf · treatment_plan_pdf · tooth_chart_pdf · consent_form · extract` выписка `· work_act` акт работ `· recommendations` рекомендации) · source_entity + source_id R (связь с лечением/оплатой: `invoice`, `treatment_plan`, …) · file_url R · generated_by R
Отправка по email в будущем — через `notifications(channel=email, type=treatment_pdf)`.

#### 29. `notifications` (v0.3: + 3 типа)
id R · clinic_id R · patient_id O · user_id O (сотрудник, in-app — напр. low stock) · appointment_id O · channel R enum(`sms·whatsapp·in_app·email`) · type R enum(`appointment_reminder · followup · repeat_visit_reminder · treatment_pdf · debt_reminder · inventory_low_stock · custom`) · body R (на языке пациента) · status R enum(`pending·sent·delivered·failed·read`) · scheduled_at R (очередь) · sent_at O · error O · timestamps

#### 30. `patient_response_links` (v0.3: + структурированный ответ)
| Поле | Тип | R/O | Примечание |
|---|---|---|---|
| id, clinic_id, patient_id | uuid | R | |
| appointment_id | uuid | O | |
| token | text | R | unique, криптослучайный, доступ без логина |
| purpose | enum | R | `confirm_appointment · feedback · document_sign` |
| status | enum | R | `active · used · expired · revoked` |
| expires_at | timestamptz | R | |
| responded_at | timestamptz | O | = used_at |
| **response_type** | enum | O | `confirm · running_late · reschedule_request · cancel` |
| **response_comment** | text | O | |
| **new_requested_time** | timestamptz | O | желаемое время переноса |
| response | jsonb | O | произвольные данные |

Ответ пациента обновляет `appointments.patient_response_status` (+ статус приёма по правилам). Мост к пациентскому кабинету.

---

### H2. Settings & i18n **(new v0.3)**

#### 31. `settings` — key-value настройки
id R · clinic_id O (null = платформенные дефолты) · scope R enum(`clinic·doctor·user`) · doctor_id O · user_id O · key R (`doctor_sees_all_patients`, `reminder_hours_before`, …) · value R jsonb · unique(clinic_id, scope, doctor_id, user_id, key) · timestamps
Чтение каскадом: user → doctor → clinic → платформенный дефолт.

#### 32. `translations` — переводы динамического контента
id R · clinic_id R · locale R enum(`az·ru·en`) · entity_type R (`service`, `service_category`, …) · entity_id R · field R (`name`) · value R · unique по всем пяти.
**Решение по i18n:** строки интерфейса — файлы `az.json`/`ru.json`/`en.json` в коде (НЕ БД); enum-статусы — i18n-ключи; эта таблица — только для контента, который вводят клиники (названия услуг), и **в MVP пустует**. Добавление RU/EN не потребует миграций.

---

### I. Audit

#### 33. `audit_logs` ⛔ append-only
id R · clinic_id O (null = действия super_admin на платформе) · user_id R (кто) · action R (что: `create·update·delete·login·export`) · entity_type + entity_id R · before/after jsonb O (старое/новое) · **ip O** (device — в составе ip/user-agent строки) · created_at R (когда)

---

## 2. Связи между таблицами

```
clinics 1─∞ users ─1 roles ─∞ role_permissions ─1 permissions
                └──∞ user_permissions ─1 permissions   (личные права поверх роли)
clinics 1─∞ doctors/assistants (профили поверх users)
patients ∞─1 clinics;  patients 1─∞ patients (guardian_id)
patients 1─∞ dental_charts (adult|child) 1─∞ tooth_records 1─∞ tooth_history
tooth_records ∞─1 doctors (последний лечащий)
patients 1─∞ treatment_plans 1─∞ treatment_items ─1 services ─1 service_categories
                                  treatment_items ─∞ prices (через service, цена копируется)
treatment_items ─∞ treatment_item_materials ─1 inventory_items ─1 inventory_categories
appointments ─1 services;  appointments 1─∞ treatment_items
appointments 1─∞ patient_response_links → обновляют patient_response_status
invoices 1─∞ invoice_items ─1 treatment_items;  invoices 1─∞ payments;  invoices 1─1 debts
suppliers 1─∞ supplier_orders 1─∞ supplier_order_items ─1 inventory_items
documents → patient | tooth_record | treatment_item;  pdf_records → source_entity/source_id
notifications → patients | users | appointments
settings → clinic | doctor | user;  translations → entity_type/entity_id
```

**Цепочка зуба:** dental_chart → tooth_record → treatment_item (процедура+услуга+цена) → treatment_item_materials (материалы) → invoice_item → invoice → payment/debt. Документ-снимок крепится прямо к tooth_record. Так каждый зуб связан с планом, процедурой, оплатой и материалами — как требуется.

---

## 3. Multi-tenant security

1. **Изоляция (автоматическая):** Prisma client extension добавляет `where clinic_id = session.clinicId` ко всем бизнес-запросам; обход — только явный `bypassTenant()` в коде super_admin. Опционально Postgres RLS вторым слоем.
2. **Super Admin** — clinic_id null, отдельная панель; видит тенантов/планы, мед. данные не читает.
3. **Clinic Admin / Owner** — всё внутри своего clinic_id.
4. **Doctor** — пациенты, где `primary_doctor_id = он` ИЛИ есть его appointment/treatment_item; расширяется индивидуальными `user_permissions` или настройкой `doctor_sees_all_patients` (settings, scope=clinic).
5. **Assistant** — только разделы из role_permissions ∪ user_permissions; при `assigned_doctor_id` — scope этого врача.
6. **Patient (будущее)** — только через `patient_response_links` (токен, expires_at) или кабинет v2.0; видит ограниченные данные.
7. Проверка прав — **только на сервере** (роль + user_permissions + scope); UI лишь скрывает. Файлы — подписанные URL после проверки тенанта.

## 4. Dental Chart model — как устроена

Пациент → `dental_charts` (контейнер, тип adult/child, max 1 каждого типа) → `tooth_records` (один на зуб, unique в карте) → `tooth_history` (append-only лента по зубу). Зуб без записи = sağlam — карта «32 здоровых зуба» не порождает 32 строки. Все записи несут clinic_id + patient_id — зубы пациентов физически не смешиваются.

## 5. Подготовка к детской стоматологии

| Механизм | Где |
|---|---|
| Отдельный тип карты child | `dental_charts.chart_type` |
| Молочные зубы 51–85 | `tooth_records.tooth_number` + `dentition=primary` |
| Смешанный прикус | в любой карте могут быть зубы обеих dentition |
| Возраст пациента | `patients.birth_date` → авто-выбор типа карты |
| Опекун | `patients.guardian_id`, согласия `documents.signed_by_guardian` |
| Детские услуги/цены | `services.is_child_service`, `prices.child_price`, категория uşaq |
| Детские статусы лечения | тот же enum ToothStatus (покрывает); при необходимости расширяется без миграции данных |

## 6. Таблицы MVP (v1.0) — 21

`clinics, users, roles, permissions, role_permissions, user_permissions, doctors, patients, appointments, dental_charts, tooth_records, tooth_history, treatment_plans, treatment_items, service_categories, services, prices, invoices, invoice_items, payments, debts, audit_logs`

## 7. Таблицы будущих версий

| Версия | Таблицы |
|---|---|
| v1.1 | `documents`, `pdf_records`, `notifications`, `patient_response_links`, `assistants`, `settings` (кроме seed-ключей, нужных MVP: doctor_sees_all_patients) |
| v1.2 | `inventory_categories`, `inventory_items`, `inventory_movements`, `suppliers`, `supplier_orders`, `supplier_order_items`, `treatment_item_materials` |
| v2.0 | `translations` (заполнение), patient_accounts (новая) |

Все таблицы уже в schema.prisma — будущие версии не потребуют ломающих миграций.

## 8. Индексы для быстрого поиска

| Таблица | Индекс | Зачем |
|---|---|---|
| patients | (clinic_id, phone); (clinic_id, last_name) | поиск на ресепшн |
| appointments | (clinic_id, doctor_id, starts_at); (clinic_id, patient_id) | календарь дня/врача |
| tooth_records | unique(dental_chart_id, tooth_number); (clinic_id, patient_id, tooth_number) | загрузка карты одним запросом |
| tooth_history | (clinic_id, patient_id, tooth_number) | лента зуба |
| treatment_items | (clinic_id, patient_id, tooth_number) | лечение по зубу |
| invoices | unique(clinic_id, number); (clinic_id, patient_id) | финансы пациента |
| payments | (clinic_id, paid_at); (clinic_id, patient_id) | кассовый день |
| debts | (clinic_id, status) | список должников |
| prices | (clinic_id, service_id, valid_to) | текущая цена |
| notifications | (clinic_id, status, scheduled_at) | очередь отправки |
| patient_response_links | unique(token) | вход по ссылке |
| audit_logs | (clinic_id, entity_type, entity_id) | история записи |
| settings | unique(clinic_id, scope, doctor_id, user_id, key) | каскад настроек |

Все FK-колонки Postgres-индексируются при миграции (Prisma создаёт индексы для @@index; FK-индексы добавить в миграции).

## 9. Риски структуры

1. **Кэш-поля** (`debts.amount`, `invoices.paid_amount`, `inventory_items.quantity`, `treatment_plans.total_price`, `appointments.patient_response_status`) могут разойтись с истиной → пересчитывать **только в одной транзакции** с порождающей записью; никаких прямых UPDATE кэша.
2. **`invoices.number` per clinic** — гонка при параллельном создании → выдавать в транзакции с `SELECT … FOR UPDATE` счётчика или advisory lock.
3. **Enum-миграции** (AppointmentStatus, ToothStatus) — добавление значения в Postgres enum требует отдельной миграции; удалять значения нельзя. Добавлять — можно, это заложено.
4. **settings unique с nullable-колонками** — Postgres считает NULL ≠ NULL, дубликаты возможны → нормализовать NULL в приложении (или частичные unique-индексы в миграции).
5. **Soft delete + unique** — `deleted_at` не входит в unique(dental_chart_id, tooth_number): удалённый зуб блокирует пересоздание → восстанавливать запись, а не создавать новую (правило приложения).
6. **Append-only — дисциплина приложения**, БД сама не запрещает UPDATE; в миграции можно добавить триггеры-запреты (не MVP).
7. **Токены ссылок** — обязательны криптослучайность (≥32 байта), expires_at и одноразовость для cancel/reschedule.
8. **Каскадных удалений нет** (намеренно): удаление через deleted_at; жёсткое удаление сломает FK — только super_admin со скриптом.

## 10. Что не усложнять на первом этапе

- **translations** — таблица пустует; MVP живёт на файловой i18n (AZ).
- **Кастомные роли клиник** — только 7 системных ролей + user_permissions; конструктор ролей не делать.
- **RLS** — достаточно Prisma-слоя; RLS добавить перед выходом на много клиник.
- **Склад целиком** (v1.2) — не делать FIFO-себестоимость, партии и инвентаризации; quantity + движения достаточно.
- **surfaces зуба** — поле зарезервировано, UI не делать.
- **Рассрочка** — это `method=installment` + debts, без графиков платежей.
- **duration приёма** — вычислять, не хранить.
- **Email-отправка заказов поставщику** — хранить email_draft, отправку отложить (v1.2+).
- **Детская карта** — структура готова, UI и логика — будущая версия.
