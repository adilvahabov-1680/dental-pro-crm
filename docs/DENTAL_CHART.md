# Dental Pro CRM — Dental Chart / Diş Xəritəsi Specification
**by AV Systems** · v0.1 · 2026-06-11
Связанные документы: [PROJECT.md](PROJECT.md) · [DESIGN.md](DESIGN.md)

Зубная карта — **витрина продукта**. Это то, что показывают врачам на демо. Она должна быть красивой, активной и профессиональной.

---

## 1. Структура карты

- Нотация **FDI**: постоянные `11–48`, молочные `51–85`.
- Раскладка — анатомическая, 4 квадранта:

```
Üst çənə (верхняя челюсть)
  18 17 16 15 14 13 12 11 │ 21 22 23 24 25 26 27 28
  ────────────────────────┼────────────────────────
  48 47 46 45 44 43 42 41 │ 31 32 33 34 35 36 37 38
Alt çənə (нижняя челюсть)
```

- Режимы карты: `permanent` (взрослая, MVP) · `primary` (молочная 55–85) · `mixed` (смешанный прикус). Режим выбирается автоматически по возрасту пациента, с ручным override. Компонент карты с первого дня принимает список зубов как данные — детский режим в будущем = другой набор зубов, **не новый компонент**.
- Каждый зуб — **отдельный интерактивный элемент** (SVG/стилизованная форма зуба, не квадратик): hover — подсветка + tooltip (номер, статус), клик — открытие карточки зуба, выбранный зуб — cyan-ring.
- Под картой — **легенда статусов** (всегда видна).
- Рядом с картой — сводка: количество зубов по статусам, последнее лечение.

---

## 2. Статусы зуба

Единый источник правды — enum `ToothStatus`. Цвета — токены из DESIGN.md, одинаковые во всей системе (карта, бейджи, история, отчёты).

| Ключ | AZ (UI) | Цвет |
|------|---------|------|
| `healthy` | Sağlam | нейтральный контур (`--text-secondary`), без заливки |
| `needs_treatment` | Müalicə tələb edir | `--warning` (янтарный) |
| `in_treatment` | Müalicə olunur | `--accent` (cyan) |
| `completed` | Tamamlandı | `--success` (зелёный) |
| `implant` | İmplant | `--info` (индиго) + иконка-маркер |
| `extracted` | Çıxarılıb | приглушённый/пунктирный контур, зуб «погашен» |
| `root_canal` | Kanal müalicəsi | фиолетовый тон + маркер корня |
| `filling` | Plomba | teal-заливка частичная |
| `crown` | Tac / Koronka | золотистый контур |
| `observation` | Müşahidə | серо-голубой, пульсирующая точка |

Названия статусов в UI — только через i18n-ключи (`tooth.status.healthy` и т.д.), AZ сейчас, RU/EN позже.

---

## 3. Карточка зуба (Tooth Panel)

Открывается по клику на зуб — **slide-over панель справа** (карта остаётся видимой). Содержимое:

1. **Шапка:** номер зуба (FDI) + название позиции, текущий статус (pill), мини-схема положения зуба.
2. **Diaqnoz** — текущий диагноз.
3. **Müalicə planı** — запланированные процедуры (услуга, ориентировочная цена, статус).
4. **Aparılmış prosedurlar** — выполненные процедуры: дата, врач, услуга, использованные материалы, стоимость.
5. **Сводка:** общая стоимость по зубу, дата последнего лечения.
6. **Tarixçə** — история изменений статуса и записей (кто, когда, что изменил) — readonly-лента.
7. **Həkim qeydləri** — заметки врача.
8. **CTA:** `+ Yeni prosedur` (главная кнопка, градиент-accent) и смена статуса.

Добавление процедуры — форма в той же панели: услуга из прайса → материалы (опционально) → цена (автоподстановка из прайса, редактируемая) → статус зуба после процедуры → сохранить. Процедура автоматически попадает в финансовый блок визита.

---

## 4. Модель данных

> Актуальная и полная схема — в [DATABASE.md](DATABASE.md) и [prisma/schema.prisma](../prisma/schema.prisma). С сессии 2 процедуры по зубу формализованы как **`treatment_items`** (ранее в этом документе назывались `tooth_procedures`) и входят в модуль Treatment (`treatment_plans` → `treatment_items`).

Зубы **не хранятся как 32 строки на пациента**. Хранятся только записи о зубах, у которых что-то есть; остальные по умолчанию `healthy`.

> **v0.3:** введён контейнер `dental_charts` (chart_type adult/child, max 1 каждого типа на пациента); `tooth_records` теперь принадлежат карте, уникальность — `(dental_chart_id, tooth_number)`. Статусов стало 13 (+ temporary_filling, crown_needed, extraction_planned). Детали — [DATABASE.md](DATABASE.md) §C.

```
dental_charts                      ── карта-контейнер (adult | child)
  id, clinic_id, patient_id, chart_type, is_active
  UNIQUE (clinic_id, patient_id, chart_type)

tooth_records                      ── текущее состояние зуба
  id, clinic_id, patient_id, dental_chart_id, doctor_id?,
  tooth_number (FDI int),
  dentition (permanent|primary), priority,
  status (ToothStatus, 13 значений),
  diagnosis, doctor_notes,
  updated_at
  UNIQUE (dental_chart_id, tooth_number)

treatment_items                    ── план и выполненное лечение (см. DATABASE.md §D)
  id, clinic_id, patient_id, doctor_id,
  treatment_plan_id?, tooth_record_id?, tooth_number?,
  service_id, status (planned|in_progress|done|cancelled),
  price, discount, surfaces (резерв),
  appointment_id?, invoice_id?, performed_at, notes
  + treatment_item_materials ── материалы со склада

tooth_history                      ── аудит по зубу (append-only)
  id, clinic_id, patient_id, tooth_number,
  changed_by, change_type, before, after, created_at
```

Правила:
- `clinic_id` + `patient_id` в каждой записи — данные зубов **никогда не пересекаются между пациентами и клиниками** (та же tenant-изоляция, что и везде).
- История ведётся **по каждому зубу отдельно** и не удаляется (append-only).
- `tooth_number` хранит FDI-номер; молочный зуб (51–85) — это другой `tooth_number`, поэтому история молочного и пришедшего на его место постоянного зуба не смешивается.
- Денормализованный `tooth_number` в procedures/history — чтобы история жила даже при сбросе текущего состояния.

---

## 5. Поведение и качество

- Карта загружается одним запросом (все tooth_records пациента), оптимистичные обновления статуса.
- Клавиатурная доступность: зубы фокусируемы, Enter открывает панель.
- Анимации: 150–200ms на hover/выбор; смена статуса — мягкий цветовой переход.
- Карта читаема на navy-фоне: контуры зубов светлые, статусные цвета — заливка/обводка.
- Mobile: карта скроллится горизонтально по квадрантам, панель зуба — fullscreen-sheet.

---

## 5a. Реализация UI (сессия 6) — что сделано

**Маршруты:**
- `/dental-chart` — выбор пациента: поиск (GET-форма), список со scope роли, переход на карту.
- `/patients/[id]/dental-chart` — карта пациента; **выбранный зуб — в URL (`?tooth=16`)**: SSR-карточка зуба, deep-link на зуб, история грузится только для открытого зуба.
- Кнопка «Diş xəritəsinə keç» на карточке пациента ведёт на карту пациента.

**Data flow:** `getPatientDentalChart(user, patientId)` → scope-проверка через `getPatientForUser` (tenant + роль) → ленивое создание контейнера `dental_charts` по типу пациента → `ensureToothRecords` досоздаёт недостающие зубы (createMany: 32 adult / 20 child) → записи с врачом. `getToothHistory` — лента по зубу (append-only) + имена авторов. Код: [lib/dental-chart.ts](../lib/dental-chart.ts), [lib/actions/dental-chart.ts](../lib/actions/dental-chart.ts).

**Access rules:** страница — `requirePermission("dental_chart.view")`; мутация — `dental_chart.manage` (в каталоге пары view/manage; «dental_chart.update» = manage). Чужой пациент → 404. Ассистент с view без manage — read-only панель, POST отклоняется сервером. `updateToothRecord`: scope пациента → принадлежность зуба пациенту (tenant-фильтрованный findFirst) → `safeUpdateByTenant`.

**Смена статуса:** обновляет status/priority/diagnosis/doctorNotes (+`doctorId` врача, `lastTreatedAt` при лечебных статусах или указанной процедуре) → **одна append-only запись `tooth_history`** (previous/new status, diagnosis, procedure_done, doctor_note, changed_by, before/after json; changeType вычисляется) → audit_log. No-op сохранение историю не создаёт. История не редактируется и не удаляется.

**Статусы → визуал:** единая карта [components/dental-chart/status-styles.ts](../components/dental-chart/status-styles.ts) (только токены; для orange/violet добавлены `--color-status-orange/violet` в globals.css). AZ-метки — `TOOTH_STATUS_META` (lib/constants.ts).

**Child chart реализован** (не placeholder): тот же компонент, набор зубов 55–51/61–65, 85–81/71–75, dentition=primary. Смешанный прикус — будущая версия (примечание на карте).

**Останется модулю Treatment:** процедуры по зубу (`treatment_items`), материалы, цены, привязка к визиту/счёту — сейчас свободное поле «Görülən iş» пишется только в tooth_history.

**Проверка:** `npx tsx scripts/e2e-dental-chart-check.ts` (нужен dev-сервер + seed).

## 6. Будущее (заложено, не реализуется в MVP)

- Детская карта (`primary`/`mixed`) — другой набор зубов в том же компоненте.
- Поверхности зуба (мезиальная/дистальная/окклюзионная…) для пломб — поле `surfaces` в procedures зарезервировать.
- Пародонтальная карта, ортодонтический режим.
- Экспорт карты в PDF (для пациента/страховой).
- Снимки, привязанные к конкретному зубу.
