# Dental Pro CRM — Модуль Pasiyentlər
**by AV Systems** · v1.0 · 2026-06-11
Связанные документы: [DATABASE.md](DATABASE.md) §B · [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md) · [SETUP.md](SETUP.md)

## Что сделано (сессия 5)

| Маршрут | Содержимое |
|---|---|
| `/patients` | список: поиск (debounce 400ms), 6 фильтров, таблица с бейджами, пагинация (10/стр), empty state, skeleton |
| `/patients/new` | форма создания (4 секции: основная / himayəçi / медицинская / клиника) |
| `/patients/[id]` | карточка: инфо, мед. данные, himayəçi/дети, кнопки действий, 5 placeholder-блоков будущих разделов |
| `/patients/[id]/edit` | редактирование с prefill |

Код: [lib/patients.ts](../lib/patients.ts) (запросы+scope), [lib/actions/patients.ts](../lib/actions/patients.ts) (server actions), [lib/validation/patients.ts](../lib/validation/patients.ts) (zod), components/patients/*.

## Access rules

| Роль | Видит | Может менять |
|---|---|---|
| owner / admin / reception / accountant | всех пациентов клиники | по `patients.manage` |
| doctor | только пациентов с `primaryDoctorId = его` (если clinic-setting `doctor_sees_all_patients=true` — всех) | только своих |
| assistant | пациентов прикреплённого врача (`assignedDoctorId`); без врача — никого | по `patients.manage` (по умолчанию нет) |
| super_admin | не имеет `patients.view` → redirect на /dashboard (страница не ломается) |

- **Permissions-маппинг:** в каталоге пары `<module>.view/manage` (DEVELOPMENT_RULES правило 4), поэтому `patients.create`/`update`/`delete` = `patients.manage`. Кнопки create/edit скрываются без manage; сервер проверяет независимо от UI.
- **Tenant:** все выборки через `tenantClient`; карточка/редактирование — `getPatientForUser(user, id)` = tenant-фильтр + ролевой scope в одном запросе. Чужой пациент по прямой ссылке → **404**, чужое редактирование невозможно (та же проверка в server action до записи).
- **Audit:** create/update пишутся в `audit_logs` (before/after-снимки ключевых полей).

## Child / Guardian логика

- Отдельного поля `is_child` в схеме нет (намеренно, DATABASE.md §5): **ребёнок = возраст < 18 ИЛИ задан `guardianId`** (`isChildPatient()` в lib/utils.ts).
- Guardian = обычный пациент клиники (self-FK `guardianId`). В форме чекбокс «Uşaq pasiyent» открывает поля himayəçi (имя+телефон): сервер ищет пациента клиники по нормализованному телефону → связывает; не находит → создаёт минимальную карточку взрослого и связывает.
- У ребёнка свой телефон необязателен — контакт через himayəçi (валидация: взрослому нужен phone, ребёнку — guardian имя+телефон).
- Поля `guardian_relation`/`guardian_note` в схеме отсутствуют — при необходимости пишутся в notes ребёнка (schema не менялась).
- **При создании пациента автоматически создаётся контейнер зубной карты**: `dental_charts(chart_type = child|adult)` по возрасту/опекуну. UI карты — будущая сессия.

## Поиск и фильтры

Поиск: имя/фамилия/отчество (insensitive contains), email, телефон (нормализованный, от 3 цифр), **телефон himayəçi** (для детей). FIN/ID-поля в схеме нет — поиск по нему отложен (потребует поле в schema → отдельное решение).
Фильтры: врач, тип (böyük/uşaq — вычисляется по birthDate/guardianId), пол, наличие аллергий, статус (active по умолчанию; archived), создан за 30 дней. Все фильтры и страница — в URL (shareable).

## Маппинг полей формы → schema

full_name → `firstName+lastName+fatherName` · medications → поле «Anamnez / dərmanlar» (`anamnesis`) · special_notes → `notes` · emergency_contact — нет в схеме, отложено · first visit source → `source` · patient type — вычисляется.

## Осталось на будущие сессии

- «Son ziyarət» в списке — заглушка «—» до модуля Qəbullar.
- Кнопки «Yeni qəbul» и «PDF çıxarış» на карточке — disabled (модули v-next/v1.1).
- «Diş xəritəsinə keç» ведёт на общий placeholder /dental-chart (персональная карта — следующая сессия).
- Удаление/архивирование отдельной кнопкой (сейчас «Arxiv» через статус в форме редактирования; жёсткого delete нет — soft-delete политика).
- patients.export, FIN-поле, emergency_contact, doctor-scope через appointments/treatments (сейчас только primaryDoctorId — других связей ещё нет).
