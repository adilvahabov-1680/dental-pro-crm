# Dental Pro CRM — Demo Guide

**by AV Systems** · создано в сессии 18 (MVP Hardening & Demo Readiness)

Для развёртывания на сервере (а не только локальной демо) — см.
[DEPLOYMENT.md](DEPLOYMENT.md).

Этот документ — шпаргалка для показа продукта клинике: кто логинится, что
показывать и в каком порядке, какие ограничения нужно проговорить заранее.

---

## 1. Demo-логины

Пароль у всех аккаунтов: **`admin123`** (дефолт `SEED_DEMO_PASSWORD` для свежей БД;
старая локальная БД может иметь предыдущий пароль, если `passwordHash` не пересоздавался).

| Email | Роль | Кто это | Для чего показывать |
|---|---|---|---|
| `admin@demo.dentalpro.az` | Klinika sahibi (owner) | Aysel Məmmədova | Главный демо-аккаунт — полный доступ ко всем модулям, включая Maliyyə, Anbar, Ayarlar, Admin. |
| `hekim@demo.dentalpro.az` | Həkim (doctor) | Dr. Elvin Quliyev | Показать scope: видит только своих пациентов (если `doctor_sees_all_patients=false`), нет доступа к Admin/Ayarlar (manage), нет Maliyyə-управления. |
| `assistent@demo.dentalpro.az` | Assistent | Nigar Əliyeva | Показать ограниченную роль: нет Maliyyə, Anbar (manage), Admin, Ayarlar (manage). |
| `superadmin@dentalpro.az` | Super Admin | — | Технический аккаунт без клиники (`clinicId = null`) — для демо клиникам **не использовать**, нужен только для платформенных задач. |

**Роли без demo-логина** (есть в каталоге ролей, но не созданы в seed):
`reception` (Qeydiyyat), `accountant` (Mühasib) — если клиника попросит
показать эти роли, можно создать пользователя через `/admin` (owner →
Yeni işçi) прямо во время демо.

## 2. Рекомендованный 10-минутный демо-путь

1. **Login** как `admin@demo.dentalpro.az` (owner).
2. **Dashboard** — обзор: сегодняшние приёмы, открытые счета, low-stock,
   активность (audit).
3. **Global Search** (topbar) — ввести `Rəşad` или `Həsən` → показать
   результаты по пациентам/телефону.
4. Открыть карточку пациента **Rəşad Həsənov** (есть зубная карта, план
   лечения, счёт, история).
5. **Diş xəritəsi** — показать FDI-зубную карту с заполненными статусами
   (16/36/11/46).
6. **Qəbullar** — создать новый приём (любой пациент, удобное время).
7. **Müalicə** — добавить процедуру/услугу пациенту.
8. **Maliyyə** — открыть/сгенерировать счёт (invoice), показать частичную
   оплату.
9. Сгенерировать **PDF** (Müalicə çıxarışı или hesab-PDF на странице счёта).
10. На карточке пациента — загрузить файл через **Fayl yüklə** (любой
    PDF/JPEG/PNG ≤10MB).
11. Подготовить **WhatsApp** напоминание о приёме (кнопка на dashboard или
    карточке пациента) — показать сгенерированный `wa.me`-текст.
12. **Sənədlər** — общий список документов клиники.
13. **Ayarlar** — реквизиты клиники, параметры приёма, рабочие часы
    (Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun — bağlı), прайс услуг.
14. **Admin** — список сотрудников, роли, активация/деактивация.

После демо рекомендуется выйти (Çıxış) и при необходимости перелогиниться
как `hekim@demo.dentalpro.az` / `assistent@demo.dentalpro.az`, чтобы
показать разницу в доступах (см. §1).

## 3. Важные URL

- Dashboard: `/dashboard`
- Pasiyentlər: `/patients`
- Qəbullar: `/appointments`
- Müalicə: `/treatments`
- Maliyyə: `/finance`
- Anbar: `/inventory`
- Sənədlər: `/documents`
- Bildirişlər: `/notifications`
- Ayarlar: `/settings` (xidmətlər: `/settings/services`)
- Admin: `/admin`

## 4. Известные ограничения (проговорить заранее, если спросят)

- **WhatsApp/SMS** — только manual click-to-chat (готовый текст + ссылка
  `wa.me`), без реальной автоматической отправки/API-интеграции.
- **Логотип клиники** — поле есть в профиле, загрузка файла и показ в PDF
  пока не реализованы.
- **Деактивация сотрудника** (`/admin`) применяется при следующем логине —
  уже открытая сессия (до 12 ч) не завершается мгновенно.
- **Временный пароль** нового сотрудника показывается один раз при создании
  и не сохраняется — если потеряли, нужно сбросить через БД.
- **Уведомления** — только in-app, без email/push.
- **Reminder hours / scheduler** — `reminder_hours_before` сохраняется в
  Ayarlar, но автоматический планировщик напоминаний пока не подключён
  (напоминания готовятся вручную через кнопку WhatsApp).

## 5. Что намеренно «вручную» в MVP

- Отправка WhatsApp/SMS-сообщений — клик пользователя открывает готовый
  чат/текст, отправляет сам пользователь.
- Загрузка файлов пациента — вручную через форму на карточке пациента.
- Назначение цен услуг — вручную в Ayarlar → Xidmətlər (история цен
  ведётся автоматически).
- Списание материалов — вручную при добавлении материала к процедуре
  (остатки склада обновляются автоматически).

## 6. Команды для разработчика

```powershell
# 1. PostgreSQL (портативная, .pglocal/)
powershell -ExecutionPolicy Bypass -File scripts\db-start.ps1

# 2. Seed (идемпотентный — безопасно перезапускать перед демо)
npm run db:seed

# 3. Dev server
npm run dev          # http://localhost:3000

# Проверки перед демо/коммитом
npx tsc --noEmit
npm run build         # останавливать dev server на время build

# E2E-наборы (нужен dev server + seed)
npx tsx scripts/e2e-patients-check.ts
npx tsx scripts/e2e-dental-chart-check.ts
npx tsx scripts/e2e-appointments-check.ts
npx tsx scripts/e2e-treatments-check.ts
npx tsx scripts/e2e-finance-check.ts
npx tsx scripts/e2e-inventory-check.ts
npx tsx scripts/e2e-dashboard-check.ts
npx tsx scripts/e2e-notifications-check.ts
npx tsx scripts/e2e-documents-check.ts
npx tsx scripts/e2e-file-uploads-check.ts
npx tsx scripts/e2e-settings-check.ts
npx tsx scripts/e2e-communications-check.ts
npx tsx scripts/e2e-global-search-check.ts
npx tsx scripts/e2e-admin-check.ts
```

## 7. Demo-данные (что уже в seed)

- Клиника: **Demo Klinika** (Nizami küç. 12, Bakı; +994 55 000 00 00;
  info@demo.dentalpro.az).
- Пациенты: **Rəşad Həsənov** (основной демо-пациент — зубная карта, план
  лечения, счёт с частичной оплатой, история движений материалов),
  **Leyla Quliyeva**, **Tural Məmmədov** (без врача — для проверки scope),
  **Aysu Həsənova** (ребёнок Rəşad'а, через himayəçi).
- Приёмы: 2 сегодня + 1 завершённый вчера.
- Услуги: 5 (из них 1 без цены — для проверки empty-состояния прайса).
- Склад: 6 материалов (2 в статусе low-stock — для демонстрации
  Anbar/Dashboard).
- Рабочие часы: Mon–Fri 09:00–18:00, Sat 10:00–14:00, Sun — bağlı
  (добавлено в сессии 18).
