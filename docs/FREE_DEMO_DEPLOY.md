# Dental Pro CRM — Free Demo Deploy Guide
**by AV Systems** · v1.0 · сессия 21 (Free Public Demo Deploy Preparation)
Связанные документы: [DEPLOYMENT.md](DEPLOYMENT.md) (VPS/production) ·
[SETUP.md](SETUP.md) (local dev) ·
[DEMO_PRESENTATION.md](DEMO_PRESENTATION.md) (сценарий показа клинике, сессия 52)

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
| `NEXT_PUBLIC_APP_URL` | `https://<ваш-проект>.vercel.app` | **Обязательно для Vercel** (см. ниже) — известный URL Vercel-деплоя |
| `STORAGE_DRIVER` | `s3` | **Рекомендуется для Vercel** (см. §9) — без этого uploads/PDF не сохраняются между запросами |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | см. §9 | Учётные данные Cloudflare R2 (или другого S3-совместимого хранилища) |

> **Безопасность**: `SESSION_SECRET` должен быть настоящим случайным значением,
> даже для demo. Если его угадают — смогут подделать cookie сессии.

> **`NEXT_PUBLIC_APP_URL` на Vercel — задавать всегда, не «опционально».**
> `buildPatientResponseUrl` (`lib/patient-response.ts`) без этой переменной
> строит абсолютный URL из заголовков запроса (`x-forwarded-host`/`host`) —
> формально работает «в dev/prod без настройки» (см.
> [PATIENT_RESPONSE_LINKS.md](PATIENT_RESPONSE_LINKS.md)), но условие
> «нужен только за нестандартным proxy/CDN» в этой формулировке как раз
> **включает Vercel** (это serverless-платформа за edge/CDN). На реальном
> demo-деплое (сессия 62) пользователь сообщил о неработающей
> подготовленной ссылке `/r/[token]` при отсутствии этой переменной —
> точную причину той конкретной ссылки подтвердить не удалось (исходный
> токен недоступен для повторной проверки), но после явной установки
> переменной и redeploy свежая сгенерированная ссылка показывает
> корректный абсолютный URL и открывается ожидаемо. Задать сразу на шаге
> выше — Vercel присваивает поддомен сразу после первого импорта проекта,
> заполнять можно уже известным URL `https://<ваш-проект>.vercel.app` до
> первого Deploy.

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

## 9. Uploads на Vercel — STORAGE_DRIVER=s3 (сессия 91)

**На Vercel/serverless файловая система эфемерна и в текущей конфигурации
недоступна на запись** — без настройки ниже загрузка лого клиники/аватара/
подписи врача/документов пациента и генерация PDF завершаются ошибкой
(`{"error":"generic"}`), без потери данных (запись в БД просто не происходит,
см. §11 «Устранение проблем»). Это подтверждено эмпирически в сессии 89.

`lib/storage.ts` поддерживает два драйвера через `STORAGE_DRIVER`:
- `local` (дефолт) — локальный диск; на Vercel НЕ подходит (см. выше).
- `s3` — S3-совместимое object storage. **Рекомендуется для Vercel-демо.**

### Настройка Cloudflare R2 (рекомендуемый провайдер для демо)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → создать бакет
   (например `dental-pro-crm-demo`). Free tier — достаточно для демо.
2. **Manage R2 API Tokens** → создать токен с правами **Object Read & Write**
   на этот бакет → сохранить Access Key ID / Secret Access Key (показываются
   один раз).
3. На странице бакета → **Settings** → скопировать **S3 API endpoint**
   (вида `https://<account-id>.r2.cloudflarestorage.com`).
4. В Vercel → Environment Variables добавить (имена — см. таблицу §5,
   `.env.example` для пояснений к каждой переменной):
   - `STORAGE_DRIVER=s3`
   - `S3_BUCKET=<имя бакета>`
   - `S3_REGION=auto`
   - `S3_ENDPOINT=<S3 API endpoint из шага 3>`
   - `S3_ACCESS_KEY_ID=<из шага 2>`
   - `S3_SECRET_ACCESS_KEY=<из шага 2>`
   - `S3_FORCE_PATH_STYLE` — НЕ задавать для R2.
5. Redeploy (Vercel → Deployments → Redeploy, либо `git push` с любым
   изменением) — `STORAGE_DRIVER` встраивается в серверный runtime сразу
   при следующем старте функции, пересборка кода не обязательна, но
   **redeploy/restart нужен** (переменные окружения подхватываются только
   при (пере)старте serverless-функции, не на лету).

**Бакет должен быть приватным** (дефолт у R2) — приложение само читает
объекты этими же ключами на сервере и отдаёт байты через уже существующие
авторизованные API-routes (`/api/clinic-logo/...`, `/api/user-avatar/...`,
`/api/doctor-signature/...`, `/api/documents/.../download`); публичный/
presigned URL клиенту никогда не передаётся — менять Public Access настройки
бакета не нужно и не следует.

**Без этой настройки** (`STORAGE_DRIVER` не задан или `local`) — uploads на
Vercel продолжат не работать; это деградирует gracefully (ошибка в форме,
без 500 и без порчи данных), не блокирует остальной функционал демо.

Альтернативы R2 — AWS S3 (region — реальный, например `eu-central-1`;
`S3_ENDPOINT` можно не задавать) или self-hosted MinIO
(`S3_FORCE_PATH_STYLE=true`) — тот же `STORAGE_DRIVER=s3`, меняются только
значения переменных.

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
| Загрузка лого/аватара/подписи/документа или генерация PDF падает с ошибкой формы (без 500) | `STORAGE_DRIVER` не задан/`local` на Vercel — настроить `s3` + R2 (см. §9) |
| `/api/health` возвращает redirect на /login | Middleware должен пропускать `/api/health` — проверить middleware.ts |
