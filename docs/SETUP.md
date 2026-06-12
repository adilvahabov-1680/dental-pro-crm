# Dental Pro CRM — Local Development Setup
**by AV Systems** · 2026-06-11
Связанные документы: [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md) · [DATABASE.md](DATABASE.md)

## 1. Требования

- Node.js 20+ и npm
- PostgreSQL 16/17 — один из двух способов ниже (БД: `dental_pro_crm`)

## 2. PostgreSQL

### Вариант A — Docker (если установлен)

```bash
docker compose up -d        # postgres:17-alpine, user/pass: postgres/postgres
```

### Вариант B — портативная PostgreSQL (без Docker и без установки в систему)

Используется на машинах без Docker. Бинарники EDB лежат в `.pglocal/` (в .gitignore).

1. Если папки `.pglocal/pgsql` нет — скачать и распаковать один раз:
   ```powershell
   # из корня dental-pro-crm
   curl.exe -L -o .pglocal\pg-binaries.zip https://get.enterprisedb.com/postgresql/postgresql-17.4-1-windows-x64-binaries.zip
   Expand-Archive .pglocal\pg-binaries.zip .pglocal
   ```
2. Запуск (initdb + start + createdb выполняются автоматически при первом запуске):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\db-start.ps1
   ```
3. Остановка:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\db-stop.ps1
   ```

⚠ Портативный режим использует `auth=trust` (вход без пароля с localhost) — **только для локальной разработки**.

## 3. .env

Скопировать `.env.example` → `.env`. Ключи:

| Ключ | Значение |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/dental_pro_crm?schema=public` |
| `SESSION_SECRET` | в dev любой; в production — криптослучайный |
| `AUTH_MOCK` | **`false`** — реальный вход через БД; `true` — временный mock без БД (только пока БД не поднята) |
| `SEED_DEMO_PASSWORD` | пароль demo-пользователей для seed (default `Demo1234!`) |

## 4. Migration и seed

```bash
npm install
npx prisma migrate deploy   # применить миграции (dev-альтернатива: npx prisma migrate dev)
npx prisma generate
npm run db:seed             # роли, permissions, demo-клиника и пользователи (идемпотентно)
```

## 5. Запуск

```bash
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Проверка tenant-изоляции на живой БД (9 проверок):
```bash
npx tsx scripts/tenant-check.ts
```

Dev-страница проверки auth/tenant-хелперов (только `npm run dev`, в production — 404):
`http://localhost:3000/dev-check`

## 6. Demo-пользователи (ТОЛЬКО локальная разработка)

Пароль у всех: `Demo1234!` (в БД — только bcrypt-хэш).

| Email | Роль |
|---|---|
| superadmin@dentalpro.az | Super Admin (платформа) |
| admin@demo.dentalpro.az | Владелец клиники Demo Klinika |
| hekim@demo.dentalpro.az | Врач (Dr. Elvin Quliyev) |
| assistent@demo.dentalpro.az | Ассистент (прикреплена к врачу) |

⚠ Перед любым публичным/production-развёртыванием: `AUTH_MOCK=false`, сменить `SESSION_SECRET`, удалить/сменить demo-пользователей, закрыть `auth=trust`.
