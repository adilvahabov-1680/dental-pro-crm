# Dental Pro CRM — Free Demo Deploy Guide
**by AV Systems** · v1.0 · сессия 21 (Free Public Demo Deploy Preparation)
Связанные документы: [DEPLOYMENT.md](DEPLOYMENT.md) (VPS/production) · [SETUP.md](SETUP.md) (local dev)

Этот документ — пошаговая инструкция для быстрого публичного demo-деплоя
без локального Docker/npm. Целевой стек: **GitHub + Vercel + Neon Postgres (free tier)**.

> **Важно**: Этот стек — только для демо. Для реальной клиники используйте
> VPS с постоянным диском (DEPLOYMENT.md). Причина — см. §5 (ограничение uploads/).

---

## 1. Предварительные требования

- Репозиторий на GitHub:
  `https://github.com/adilvahabov-1680/dental-pro-crm`
- Аккаунт на [vercel.com](https://vercel.com) (бесплатный Hobby-план)
- Аккаунт на [neon.tech](https://neon.tech) (бесплатный Free-план)
- Node.js + npm локально — для инициализации БД через Neon

---

## 2. Шаг 1 — Создать базу данных на Neon

1. Зайти на [console.neon.tech](https://console.neon.tech) → **New Project**.
2. Имя проекта: `dental-pro-crm` (или любое).
3. После создания открыть проект → вкладка **Connection Details**.
4. Выбрать **Connection string** (НЕ «Pooled connection string»).
   - Нужна прямая (non-pooled) строка подключения — она работает
     с `prisma migrate deploy`. Pooled-строка (с pgBouncer) не поддерживает
     транзакционные миграции.
5. Скопировать строку вида:
   ```
   postgresql://user:password@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Это ваш `DATABASE_URL`.

---

## 3. Шаг 2 — Инициализировать базу данных (локально, один раз)

Выполнить с вашим Neon `DATABASE_URL`:

```bash
# Клонировать (если ещё не клонировали)
git clone https://github.com/adilvahabov-1680/dental-pro-crm.git
cd dental-pro-crm
npm install

# Задать DATABASE_URL для этой сессии терминала:
# Windows PowerShell:
$env:DATABASE_URL = "postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require"
# Linux/macOS:
# export DATABASE_URL="postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require"

# Одна команда для инициализации:
npm run demo:deploy:init
# Эквивалент:
#   npx prisma migrate deploy   ← применяет миграции к Neon БД
#   npx prisma generate         ← генерирует Prisma Client
#   npm run db:seed             ← создаёт demo-клинику, пользователей, данные
```

`npm run demo:deploy:init` идемпотентен — безопасно запускать повторно
(seed использует upsert / create-if-not-exists).

После успешного выполнения в Neon появятся все таблицы и demo-данные.

---

## 4. Шаг 3 — Подключить репозиторий к Vercel

1. Зайти на [vercel.com](https://vercel.com/new) → **Import Git Repository**.
2. Выбрать `adilvahabov-1680/dental-pro-crm`.
3. Framework Preset: **Next.js** (определяется автоматически).
4. Build Command: `npm run build` (по умолчанию — оставить).
5. Install Command: `npm install` (по умолчанию — оставить).
   - `postinstall` скрипта автоматически запускает `prisma generate`.
6. **Не нажимать Deploy ещё** — сначала задать переменные окружения.

---

## 5. Шаг 4 — Задать переменные окружения в Vercel

В разделе **Environment Variables** добавить:

| Переменная | Значение | Примечание |
|---|---|---|
| `DATABASE_URL` | `postgresql://...neon.tech/...?sslmode=require` | Нeon direct connection string |
| `SESSION_SECRET` | `<случайная строка>` | `openssl rand -base64 32` или любой длинный секрет |
| `AUTH_MOCK` | `false` | Обязательно false для работы с реальной БД |
| `SEED_DEMO_PASSWORD` | `admin123` | Пароль demo-аккаунтов |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Показывает подсказку "admin / admin123" на странице входа |

> **Безопасность**: `SESSION_SECRET` должен быть настоящим случайным значением,
> даже для demo. Если его угадают — смогут подделать cookie сессии.

---

## 6. Шаг 5 — Задеплоить

Нажать **Deploy**. Vercel:
1. Клонирует репозиторий.
2. Запускает `npm install` → `postinstall` → `prisma generate`.
3. Запускает `npm run build` → `next build`.
4. Публикует приложение.

Если всё прошло — Vercel покажет URL вида `dental-pro-crm-xxx.vercel.app`.

---

## 7. Шаг 6 — Проверить деплой

Открыть URL из Vercel.

Должна открыться страница входа с подсказкой:

```
Demo giriş
admin / admin123
```

Войти:
- **Логин**: `admin`
- **Пароль**: `admin123`

Или полный email:
- **Логин**: `admin@demo.dentalpro.az`
- **Пароль**: `admin123`

После входа — dashboard с demo-данными (пациенты Rəşad, Leyla, Tural, Aysu;
приёмы, счёт, зубная карта Rəşad'а).

---

## 8. Health check

```bash
curl https://your-app.vercel.app/api/health
# → {"ok":true,"service":"dental-pro-crm"}
```

Работает без авторизации — для мониторинга / проверки деплоя.

---

## 9. ⚠️ Ограничение: uploads / локальное хранилище файлов

**На Vercel/serverless файловая система эфемерна.**

- Загрузка файлов пациентов (`Fayl yüklə`) и генерация PDF технически
  работают в рамках одного запроса, но **файлы не сохраняются между запросами
  и исчезают после следующего деплоя**.
- Функция загрузки документов в demo-режиме демонстрирует интерфейс,
  но не является надёжным хранилищем.
- Для реальной клиники нужно:
  - VPS с постоянным диском (см. DEPLOYMENT.md), или
  - S3/R2/MinIO (будущая задача — Session 22+).

**Для demo**: показывайте загрузку файлов как UI-фичу, заранее предупредив,
что файлы на Vercel-деплое не сохраняются постоянно.

---

## 10. Обновление demo-деплоя

```bash
# Запушить изменения в GitHub:
git push origin main

# Vercel автоматически перебилдит приложение.
# Если менялась schema.prisma — применить миграции заново через Neon DATABASE_URL:
#   $env:DATABASE_URL = "postgresql://..."   (Windows PowerShell)
npx prisma migrate deploy
```

Seed повторно запускать не нужно (данные уже в Neon и seed идемпотентен).
Но если нужно пересоздать demo-данные: `npm run demo:deploy:init`.

---

## 11. Устранение проблем

| Проблема | Решение |
|---|---|
| Ошибка при входе ("E-poçt və ya şifrə yanlışdır") | Проверить: `AUTH_MOCK=false`, база инициализирована (`demo:deploy:init`), `SEED_DEMO_PASSWORD=admin123` |
| Build failed: "PrismaClientInitializationError" | `DATABASE_URL` не задан или неверный |
| Build failed: "Can't find module @prisma/client" | `postinstall` должен был запустить `prisma generate` — проверить логи Vercel |
| Файл загружен, но пропал | Ожидаемое поведение на Vercel (см. §9) |
| `/api/health` возвращает redirect на /login | Middleware должен пропускать `/api/health` — проверить middleware.ts |
