# Dental Pro CRM — CI / E2E Strategy v1

**by AV Systems** · создано в сессии 56 (CI Database / E2E Workflow Planning v1)

Этот документ объясняет, что сейчас умеет CI, чего не умеет, и почему;
какой вариант выбран для DB-backed e2e в CI и почему он **manual-first**,
а не обязательный blocking-чек на каждый push.

---

## 1. Текущее состояние CI (до и после этой сессии)

| Workflow | Триггер | Что делает | БД? |
|---|---|---|---|
| `.github/workflows/codeql.yml` | push/PR на `main` | статический анализ кода | нет |
| `.github/workflows/ci.yml` | push/PR на `main` | `tsc --noEmit` + `next build` | нет (dummy `DATABASE_URL`, build не подключается к БД — см. EXTERNAL_AUDIT.md) |
| `.github/workflows/e2e-smoke.yml` **(новый, сессия 56)** | **только `workflow_dispatch`** (ручной запуск) | реальный Postgres service container, migrate+seed, запуск приложения, 3 smoke e2e-набора | да, изолированная ephemeral CI-БД |

До этой сессии: 0 e2e-наборов из 40 запускались автоматически где-либо
кроме локальной машины разработчика. После: 3 из 40 можно запустить
вручную в GitHub Actions по требованию.

## 2. Static CI vs DB-backed e2e

- **Static CI** (`ci.yml`) — typecheck + build. Не требует БД, не требует
  сервера, безопасен на каждый push/PR. Ловит: TypeScript-ошибки, broken
  imports, build-time ошибки (включая server/client component boundary
  ошибки Next.js).
- **DB-backed e2e** (`e2e-smoke.yml`) — реальный HTTP-сервер + реальная
  Postgres + реальный login + бизнес-логика. Ловит: regressions в server
  actions, permission-guards, tenant isolation, фактическое поведение
  страниц — то, что typecheck/build физически не может проверить (TypeScript
  не знает, что `requirePermission` действительно блокирует не-owner'а).
- Они **не конкурируют** — typecheck/build остаётся обязательным на каждый
  push (быстрый, дешёвый, ловит большинство багов); e2e-smoke — дополнительный,
  более дорогой и более глубокий слой, запускаемый по требованию.

## 3. Выбранный вариант: A (GitHub Actions Postgres service container), manual-first

Из трёх вариантов, рассмотренных в архитектурной записке этой сессии:

| Вариант | Итог |
|---|---|
| **A. GitHub Actions Postgres service container** | ✅ **выбран** — без внешних секретов, изолированная одноразовая БД, полностью воспроизводимо |
| **B. Neon test branch** | ❌ не выбран — требует секрет (Neon API token/connection string), зависимость от внешнего аккаунта/тарифа, риск при неправильной настройке (правило сессии: «не добавлять платные integration secrets») |
| **C. Только manual/local e2e** | было статус-кво до этой сессии — менее автоматизированная уверенность, но безопасно. Теперь дополнено вариантом A как **опциональный** ручной слой, не заменяя локальный прогон |

### Почему manual (`workflow_dispatch`), а не на каждый push/PR

1. **Скорость PR-цикла**: полный цикл (build + migrate + seed + start +
   3 e2e-набора) занимает заметно больше времени, чем typecheck/build —
   делать его blocking на каждый push замедлило бы итерацию без
   пропорциональной выгоды на этом этапе.
2. **Только 3 из 40 e2e-наборов** включены — `e2e-release-candidate-check`,
   `e2e-demo-flow-check`, `e2e-production-hardening-check` (release-critical
   smoke, не полный модульный матрикс). Остальные 37 — ещё не оркестрированы
   для CI (некоторые создают/чистят собственные временные данные, что не
   аудировано построчно на предмет CI-совместимости в этой сессии).
3. **Новизна паттерна**: это первый раз, когда DB-backed e2e запускается в
   GitHub Actions для этого проекта — разумно сначала убедиться, что он
   стабильно зелёный при ручных запусках несколько раз, прежде чем делать
   его обязательным gate (см. §6 «Будущий путь»).
4. Locally e2e уже стабильно зелёные (40/40 наборов проверяются вручную
   перед каждым коммитом, см. SESSION_HANDOFF.md) — manual CI-копия снижает
   риск «works on my machine», но не заменяет необходимость самой
   методологии.

## 4. Безопасные env-правила (обязательно для любого DB-backed workflow)

- **Postgres — ТОЛЬКО service container** (`services: postgres:`), который
  живёт исключительно внутри одного ephemeral GitHub-runner и умирает
  вместе с job. Никогда — managed/внешняя БД с реальными учётными данными.
- **`DATABASE_URL` — захардкожен в YAML, НЕ из `secrets.*`**. Если в
  workflow-файле нет `${{ secrets. }}` для БД — физически невозможно
  случайно подставить туда production-строку подключения.
- **`SESSION_SECRET` — длинная dummy-строка**, явно помеченная как
  «not for production» в самом значении — невозможно перепутать с реальным
  секретом при чтении логов/diff.
- **`SEED_DEMO_PASSWORD=Demo1234!`** — тот же демо-пароль, что и в
  local dev (см. SETUP.md) — НЕ `admin123` (это для публичного demo-деплоя,
  смешивать с CI не нужно).
- **Никогда не указывать реальный `DATABASE_URL`/`SESSION_SECRET` клиники
  в любом `.yml`-файле репозитория** — даже как `secrets.*` ссылку, если
  только не принято отдельное, осознанное решение с владельцем проекта.
- `e2e-ci-e2e-strategy-check.ts` (сессия 56) — статически проверяет, что
  workflow не содержит паттернов реальных секретов/production-подобных URL.

## 5. Как запустить локальный эквивалент

```bash
# 1. Поднять локальную PostgreSQL (или использовать существующую dev-БД)
powershell -ExecutionPolicy Bypass -File scripts\db-start.ps1

# 2. Применить миграции + засеять (идемпотентно)
npx prisma migrate deploy
npx prisma db seed

# 3. Собрать и запустить production-бандл
npm run build
npm run start          # отдельное окно/процесс, http://localhost:3000

# 4. В другом терминале — те же 3 smoke-проверки, что в e2e-smoke.yml
npm run e2e-release-candidate-check
npm run e2e-demo-flow-check
npm run e2e-production-hardening-check
```

Эквивалентно тому, что делает `e2e-smoke.yml`, на собственной машине —
без GitHub Actions.

## 6. Будущий путь (не сделано в этой сессии)

1. **Несколько ручных прогонов `e2e-smoke.yml`** (без изменений кода) —
   убедиться, что workflow стабильно зелёный, прежде чем переходить к
   следующим шагам.
2. **Добавить CI service DB на push/PR** — превратить `e2e-smoke.yml`
   (или его часть) в обязательный gate, возможно сначала только на `main`
   после merge, не на каждый PR (баланс скорости/уверенности).
3. **Расширить e2e matrix** — постепенно добавлять оставшиеся 37 наборов
   (по группам — finance/inventory/communications/notifications и т.д.),
   проверяя на CI-совместимость (временные данные, очистка, паттерны
   `formContaining` и т.п. — см. SESSION_HANDOFF.md §4 «E2E-техника»)
   по одному перед включением.
4. **Сделать smoke обязательным** — после стабилизации (см. п.1-3),
   перевести `e2e-smoke.yml` (или его расширенную версию) с
   `workflow_dispatch` на `push`/`pull_request` триггер, как у `ci.yml`.
5. Опционально — managed CI-БД (Neon test branch, вариант B) если
   потребуется ближе-к-production окружение; требует отдельного решения
   о секретах/аккаунте, см. EXTERNAL_AUDIT.md §2.

## 7. Статус первого прогона (сессия 57)

**Статус: pending user-run** — `e2e-smoke.yml` ни разу не запускался на
реальном GitHub Actions runner. В среде сессии 57 нет установленного/
авторизованного `gh` (GitHub CLI) — проверено в обоих доступных shell
(Bash и PowerShell), `gh` не найден ни там, ни там. Без него запустить
`workflow_dispatch` или прочитать логи прогона из этой среды невозможно.
**Результат прогона НЕ заявляется как зелёный** — только статическая
проверка workflow-файла (`e2e-ci-e2e-strategy-check.ts`) и ручной
построчный разбор YAML на предмет очевидных ошибок (env-цепочка,
порядок шагов, совместимость версий — см. architecture note сессии 57 в
SESSION_HANDOFF.md §7.35).

### Как запустить вручную (точные шаги UI)

1. Открыть репозиторий на GitHub: `https://github.com/adilvahabov-1680/dental-pro-crm`.
2. Вкладка **Actions**.
3. В списке workflow слева — **E2E Smoke**.
4. Кнопка **Run workflow** (справа над списком прогонов).
5. Branch: **main** (по умолчанию).
6. Кнопка **Run workflow** (зелёная, подтверждение).
7. Подождать завершения (ожидаемо несколько минут — build + migrate + seed
   + 3 e2e-набора; job ограничен `timeout-minutes: 15`).
8. Открыть сам прогон → проверить каждый шаг зелёный. Если какой-то шаг
   красный — открыть его лог (стрелка разворачивает шаг), скопировать
   полный текст ошибки.
9. Если упало на «Wait for /api/health/db» или раньше — лог `app.log`
   автоматически печатается в шаге «Show app log on failure».

### Что делать с результатом

- **Если все шаги зелёные**: обновить этот раздел (заменить «pending
  user-run» на «✅ passed» + дата/commit/run URL) — это явно не сделано
  автоматически в сессии 57, требует ручного шага владельца проекта,
  т.к. сама среда сессии не может это подтвердить.
- **Если что-то упало**: скопировать точный текст ошибки и вернуться к
  агенту/в следующую small-сессию с этим логом — допустимые фиксы
  ограничены CI/workflow/orchestration (см. правила сессии 57 в
  SESSION_HANDOFF.md), не бизнес-логикой.

## 8. Первый реальный прогон — упал на migration portability (сессия 58)

**Статус: pending user re-run** (фикс внесён, повторный прогон ещё не
подтверждён — `gh` CLI всё ещё недоступен в среде агента, проверено
повторно в сессии 58).

Пользователь запустил `E2E Smoke` вручную на `branch main`, commit
`52586f5`. Workflow дошёл до шага **«Apply migrations (CI-only ephemeral
DB)»** (`npx prisma migrate deploy`) и упал:

```text
Error: P3018
A migration failed to apply. New migrations cannot be applied before
the error is recovered from.
Migration name: 20260618100805_add_consumable_reversal
Database error code: 42704
Database error: ERROR: index "treatment_consumable_usages_inventory_movement_id_idx" does not exist
```

**Root cause**: миграция `20260618100805_add_consumable_reversal`
(timestamp `10:08:05`) сортируется и применяется **раньше**, чем
`20260618120000_add_treatment_consumable_usage` (timestamp `12:00:00`) —
но именно вторая создаёт таблицу `treatment_consumable_usages` и нужный
индекс. На полностью чистой БД (ephemeral CI Postgres, ни одной
применённой миграции) Prisma реплеит историю строго по сортировке имён
папок и упирается в `DROP INDEX`/`ALTER TABLE`/`CREATE INDEX`/
`RENAME INDEX` на таблицу, которой ещё не существует. Локально это не
проявлялось, т.к. обе миграции уже были отмечены как применённые в
`_prisma_migrations` локальной dev-БД — Prisma никогда не реплеила их с
нуля до этого момента.

**Фикс** (без новой миграции, без изменения schema.prisma, без правки
бизнес-логики): 4 проблемные SQL-команды перенесены **слово в слово**
из `20260618100805_add_consumable_reversal/migration.sql` в конец
`20260618120000_add_treatment_consumable_usage/migration.sql` (после
создания таблицы/индексов/FK) — сохранён их исходный текст и
относительный порядок, изменилось только то, в каком файле/после какого
момента они выполняются. Все остальные команды в `100805` (alter enum,
правки `supplier_order_items`/`service_consumable_templates`) не
относятся к `treatment_consumable_usages` и были безопасны на исходном
месте — не тронуты.

**Проверено локально** (сессия 58, перед коммитом): создана отдельная
**временная** Postgres-БД на той же портативной локальной инсталляции
(`dental_pro_crm_ci_fresh_test`, удалена после проверки — основная
dev-БД не тронута), на ней с нуля выполнены `npx prisma migrate deploy`
(все 16 миграций применились без ошибок) → `npx prisma db seed`
(прошёл полностью) → ручная проверка структуры таблицы
(`\d treatment_consumable_usages`) — все 5 reversal-колонок, все 4
non-unique индекса (`clinic_id`/`treatment_item_id`/`inventory_item_id`/
`is_reversed`) и единственный `UNIQUE` на `inventory_movement_id`
(без избыточного отдельного индекса) — присутствуют, 1:1 совпадают с
`schema.prisma`.

**Что осталось**: реальный прогон на GitHub Actions (с этим фиксом) —
см. §7 выше, те же точные шаги UI. Если упадёт снова — на ЭТОМ шаге
упасть он больше не должен (проверено локально на from-zero реплее
с тем же `prisma migrate deploy`); если упадёт на чём-то другом
(build/start/health/e2e) — это отдельная, новая находка, не относится
к этому фиксу.

## См. также

- [EXTERNAL_AUDIT.md](EXTERNAL_AUDIT.md) §1.4 — где это было анонсировано
  как future work (сессия 55).
- [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) — сводный
  release-чеклист v1.0.
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — шаги деплоя + smoke tests
  (ручные, на целевой инфраструктуре — не путать с этим CI smoke).
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) §4 «E2E-техника» — конвенции
  написания e2e-скриптов в этом проекте.
