# Dental Pro CRM — Deployment Guide
**by AV Systems** · v1.2 · обновлено в сессии 23
Связанные документы: [SETUP.md](SETUP.md) (local dev) · [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md) (Vercel + Neon) ·
[SESSION_HANDOFF.md](SESSION_HANDOFF.md) · [DOCUMENTS.md](DOCUMENTS.md) (storage) · [DATABASE.md](DATABASE.md)

Эта сессия — техническая подготовка к запуску, **без изменений бизнес-логики**
и **без изменений schema.prisma**. Документ описывает, как развернуть текущую
кодовую базу на собственном сервере (self-hosted/VPS).

---

## 1. Рекомендуемая платформа

**Self-hosted VPS / собственный сервер: Node.js + PostgreSQL + постоянный диск.**

Почему не serverless (Vercel/Netlify/аналоги) — без доработок:

- Загруженные файлы пациентов и сгенерированные PDF хранятся на локальном
  диске в `uploads/` (`lib/storage.ts`, см. [DOCUMENTS.md](DOCUMENTS.md)).
  На serverless файловая система эфемерна — файлы пропадут между запросами/
  деплоями.
- Перед таким переходом `lib/storage.ts` нужно заменить на S3-совместимый
  слой (MinIO/S3/R2) — это **отдельная задача**, в v1 не сделана.
- На VPS требование простое: каталог `uploads/` должен жить на постоянном
  диске (не tmpfs/ephemeral volume) и попадать в backup (см. §5).

Если в будущем нужен serverless — сначала миграция storage на S3, потом
деплой; иначе загруженные документы и сгенерированные PDF будут теряться.

## 2. Требования к серверу

| Компонент | Версия / рекомендация |
|---|---|
| Node.js | 20 LTS или новее (как в [SETUP.md](SETUP.md)) |
| npm | идёт с Node.js (проверено с npm, входящим в Node 20+) |
| PostgreSQL | 16 или 17 |
| Диск | минимум несколько ГБ свободно под `uploads/` (растёт с количеством сканов/PDF пациентов) + место под backup БД |
| ОЗУ | от 1 ГБ для Node-процесса (минимально для Next.js prod-сервера); больше — по нагрузке/числу клиник |
| Reverse proxy | опционально — nginx/Caddy для TLS (HTTPS) и проксирования на `localhost:3000`; конфиг не входит в эту сессию |

## 3. Первый деплой

```bash
# 1. Клонировать репозиторий
git clone https://github.com/adilvahabov-1680/dental-pro-crm.git
cd dental-pro-crm

# 2. Установить зависимости (postinstall автоматически запускает prisma generate)
npm install

# 3. Создать .env из примера и заполнить production-значения
cp .env.example .env
# Обязательно:
#  - DATABASE_URL → реальная строка подключения к production PostgreSQL
#  - SESSION_SECRET → криптослучайный секрет: openssl rand -base64 32
#  - AUTH_MOCK="false"
#  - SEED_DEMO_PASSWORD → задать свой, если планируется запускать seed

# 4. Сгенерировать Prisma Client (уже сделано postinstall, но явно — не помешает)
npx prisma generate

# 5. Применить миграции (production-режим, без интерактивных вопросов)
npx prisma migrate deploy

# 6. (опционально) Засеять справочники/demo-данные
#    Для боевой клиники — обычно НЕ нужно (создаёт demo-пользователей/клинику).
#    Для пилотного запуска с demo-данными — можно выполнить один раз.
npm run db:seed

# 7. Собрать production-бандл
npm run build

# 8. Запустить production-сервер
npm run start          # next start, по умолчанию http://localhost:3000
```

Процесс из шага 8 должен работать под supervisor'ом (systemd/pm2/docker —
любой, конфиг не входит в эту сессию), чтобы автоматически перезапускаться
при падении/перезагрузке сервера.

## 4. Обновление деплоя

```bash
git pull
npm install                # если изменился package.json/lock
npm run prod:migrate       # применить новые миграции — идемпотентно, безопасно
npm run prod:update        # migrate + generate + build (полный пересборк)
# перезапустить процесс (systemd restart / pm2 restart / etc.)
```

Скрипты в `package.json`:

| Скрипт | Что делает | Когда использовать |
|--------|-----------|-------------------|
| `prod:migrate` | `prisma migrate deploy` | только DB-изменения (без пересборки) |
| `prod:update` | migrate + generate + build | типичное обновление кода |
| `demo:deploy:init` | migrate + generate + **seed** | только первый деплой demo-стенда |

> **Важно:** `demo:deploy:init` запускает `db:seed` — он создаёт demo-клинику и
> demo-пользователей. На production-сервере (с реальными данными) этот скрипт
> **не запускать** — только `prod:update`.

`npm run prod:migrate` (`prisma migrate deploy`) идемпотентен — безопасно
запускать даже если новых миграций нет.

## 5. Backup

Что нужно регулярно бэкапить:

1. **PostgreSQL** — `pg_dump` (или аналог для managed-БД). Содержит все
   бизнес-данные: пациентов, приёмы, лечение, финансы, метаданные
   документов (`documents`/`pdf_records` — пути к файлам, не сами файлы).
   ```bash
   pg_dump -Fc -d dental_pro_crm -f backup_$(date +%Y%m%d).dump
   ```
2. **`uploads/`** — физические файлы (загруженные сканы/фото, сгенерированные
   PDF). Без этого backup'а записи в БД будут указывать на отсутствующие
   файлы (приложение это обрабатывает гracefully — fileMissing/404, но данные
   потеряны). Простой вариант — `tar`/rsync каталога целиком.
3. **`.env`** — хранить отдельно, в защищённом менеджере секретов/доступом
   только у администратора. Содержит `SESSION_SECRET` и креды БД.

**Порядок восстановления**: сначала восстановить PostgreSQL (`pg_restore`/
`psql`), затем восстановить `uploads/` в тот же относительный путь
(`uploads/documents/{clinicId}/{patientId}/...`), затем восстановить `.env`,
затем `npm install` → `npx prisma generate` → `npm run build` → `npm run start`.
Порядок важен из-за `fileUrl` в БД, который хранит relative path внутри
`uploads/`.

## 6. Известные ограничения (на момент сессии 20)

- **Storage** — локальный диск, без S3 (см. §1). Перенос storage —
  отдельная задача.
- **WhatsApp/SMS** — только manual click-to-chat (готовый текст + `wa.me`-
  ссылка), без реальной отправки/API. См. COMMUNICATIONS.md.
- **Уведомления** — tenant-level «прочитано» (без per-user read-state).
- **Cleanup удалённых документов** — ручной скрипт
  (`scripts/cleanup-deleted-documents.ts`, dry-run по умолчанию), без cron.
- **Деактивация сотрудника** (`/admin`) — уже выданная JWT-сессия (до 12 ч)
  не инвалидируется немедленно; применяется при следующем логине.
- **Cookie `secure`** — выставляется автоматически когда
  `NODE_ENV=production` (см. `lib/actions/auth.ts`), что требует HTTPS перед
  приложением (reverse proxy с TLS) — без HTTPS браузер будет отвергать
  cookie и логин не сработает в production-режиме.

## 7. Полезные команды

```bash
# Типичное обновление production (migrate + generate + build)
npm run prod:update

# Только применить миграции (без пересборки)
npm run prod:migrate

# Сборка вручную
npm run build

# Типы
npx tsc --noEmit

# Демо/global-search smoke-тесты (нужен запущенный сервер + seed)
npx tsx scripts/e2e-demo-flow-check.ts
npx tsx scripts/e2e-global-search-check.ts

# Очистка физических файлов soft-deleted документов
npx tsx scripts/cleanup-deleted-documents.ts            # dry-run
npx tsx scripts/cleanup-deleted-documents.ts --execute  # реальное удаление

# Seed (идемпотентно — безопасно перезапускать)
npm run db:seed

# Health checks (без авторизации)
curl http://localhost:3000/api/health     # → {"ok":true,"service":"dental-pro-crm"}
curl http://localhost:3000/api/health/db  # → {"ok":true,"db":"connected"}
```

## 9. Бесплатный публичный demo-деплой (Vercel + Neon)

Для быстрого публичного demo без VPS — см. [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md).
Основные отличия от VPS-деплоя:

- DATABASE_URL — Neon Postgres (direct connection string, не pooled).
- Миграции и seed запускаются **локально** один раз: `npm run demo:deploy:init`.
- `NEXT_PUBLIC_DEMO_MODE=true` включает подсказку "admin / admin123" на логин-странице.
- Файлы в `uploads/` **не сохраняются** между деплоями (Vercel ephemeral FS).

## 8. Health checks

### `GET /api/health`

Статичный ответ `{ "ok": true, "service": "dental-pro-crm" }`, без авторизации
и без обращения к БД. Для reverse proxy / process manager
(`pm2`/systemd `ExecStartPre`/load balancer).

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"service":"dental-pro-crm"}
```

### `GET /api/health/db`

Проверяет реальное подключение к Postgres (`SELECT 1`). Без авторизации.
Возвращает `200` при успехе, `503` при недоступности БД.

```bash
curl http://localhost:3000/api/health/db
# → {"ok":true,"db":"connected"}
# при ошибке БД:
# → {"ok":false,"db":"disconnected","error":"..."} (HTTP 503)
```

Использовать для monitoring/alerting (Uptime Robot, Grafana, etc.) —
в отличие от `/api/health`, покажет реальную проблему с Postgres.

`middleware.ts` пропускает оба `/api/health` и `/api/health/db` без проверки
сессии.
