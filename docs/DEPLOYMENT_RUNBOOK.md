# Dental Pro CRM — Deployment Runbook v1

**by AV Systems** · создано в сессии 54 (Deployment / Backup / Monitoring v1)

Это **исполняемый чеклист** для конкретного деплоя (первого или
обновления) — последовательность шагов «сделай → проверь → дальше».
Объяснение архитектуры/почему — [DEPLOYMENT.md](DEPLOYMENT.md); security-
аудит — [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md); сводный
release-чеклист — [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md);
backup/monitoring policy — [BACKUP_MONITORING.md](BACKUP_MONITORING.md).

---

## 0. Pre-deploy checklist

- [ ] Репозиторий чистый (`git status --short` пусто), целевой коммит/тег
      известен.
- [ ] `npx tsc --noEmit` — 0 ошибок на целевом коммите.
- [ ] Если это **обновление** (не первый деплой) — свежий backup БД снят
      ДО миграции (см. BACKUP_MONITORING.md §1).
- [ ] Если меняется `schema.prisma` — миграция проверена локально
      (`npx prisma migrate dev` на dev-БД) до `migrate deploy` на production.
- [ ] Известно, что `next dev` НЕ запущен параллельно с `npm run build` на
      этой же машине (общий `.next/` — конфликт воркеров).

## 1. Env vars (проверить перед стартом)

Полный справочник — `.env.example` (с комментариями) + DEPLOYMENT.md §3.
Минимально обязательные для production:

| Переменная | Production-значение | Проверка |
|---|---|---|
| `DATABASE_URL` | реальная production БД, отдельная от dev/demo | подключение проверяется `prisma migrate deploy` (шаг 3) |
| `SESSION_SECRET` | криптослучайный (`openssl rand -base64 32`) | НЕ `change-me-in-production` из `.env.example` — `lib/session.ts` упадёт с понятной ошибкой при старте, если забыт |
| `AUTH_MOCK` | `false` (или не задан) | дополнительно игнорируется кодом при `NODE_ENV=production`, но выставлять явно — обязательно |
| `NEXT_PUBLIC_DEMO_MODE` | `false` (или не задан) для реальной клиники | `true` — только для публичного demo-деплоя; встраивается в бандл при сборке, смена требует **пересборки** |
| `SEED_DEMO_PASSWORD` | не задавать / задать свой, **если** планируется `db:seed` на production | см. §3 «production seed caution» |
| `NEXT_PUBLIC_APP_URL` | опционально, явно задать если за нестандартным proxy/CDN | иначе строится из заголовков запроса автоматически |
| `PLATFORM_OWNER_EMAIL`/`_PASSWORD`/`_LOGIN`/`_NAME` | опционально, только если нужен персональный platform-аккаунт | см. `.env.example` |

## 2. Database migration

```bash
npx prisma migrate deploy
# или эквивалент:
npm run prod:migrate
```

- Идемпотентно — безопасно запускать, даже если новых миграций нет.
- **Никогда** не использовать `prisma migrate dev` на production
  (интерактивный, может запросить confirmation на потенциально
  деструктивные операции).
- Если миграция меняет существующие таблицы с данными — backup ОБЯЗАТЕЛЕН
  до этого шага (см. §0).

## 3. Seed / demo steps

```bash
npm run db:seed
```

**Production seed caution**:
- `db:seed` идемпотентен (upsert/create-if-not-exists), НЕ перезатирает уже
  существующие пользовательские данные.
- НО он создаёт demo-клинику (`Demo Klinika`) и demo-пользователей
  (`admin@demo.dentalpro.az` и т.д.) с паролем `SEED_DEMO_PASSWORD`.
- **На реальной клинике с настоящими данными — обычно НЕ запускать.**
  Запускать только при первом пилотном деплое, где demo-данные нужны для
  показа, или явно осознанно. Если уже запускался и нужно закрыть demo-
  доступ — см. PRODUCTION_HARDENING.md §7 чеклист («demo-пользователи —
  удалены или пароли сменены»).
- Для Vercel+Neon demo-деплоя — `npm run demo:deploy:init` (migrate + generate
  + seed одной командой), см. FREE_DEMO_DEPLOY.md.

## 4. Build verification

```bash
# Остановить next dev, если запущен в этой же папке (общий .next/)
npm run build
```

- Ожидается чистая сборка без ошибок/warnings о неразрешённых модулях.
- `npx tsc --noEmit` должен быть чистым ДО build (см. §0).
- После build — запустить процесс: `npm run start` (или через supervisor —
  systemd/pm2/docker, конфиг вне этого документа).

## 5. Smoke tests (после старта production-процесса)

Прогнать вручную (`curl`/браузер) сразу после деплоя:

1. **Login** — открыть `/login`, убедиться, что страница отдаёт 200 и форма
   рендерится. Если `NEXT_PUBLIC_DEMO_MODE=false` — подсказка с demo-
   паролем НЕ должна отображаться (проверить визуально на реальной клинике).
2. **Dashboard** — залогиниться существующим/demo-аккаунтом, убедиться, что
   `/dashboard` открывается и не редиректит на `/login`.
3. **`GET /api/health`**:
   ```bash
   curl https://<your-domain>/api/health
   # → {"ok":true,"service":"dental-pro-crm"}
   ```
4. **`GET /api/health/db`**:
   ```bash
   curl https://<your-domain>/api/health/db
   # → {"ok":true,"db":"connected"}
   ```
   Если `503` — БД недоступна (`DATABASE_URL` неверен/БД не отвечает) —
   **не продолжать**, не объявлять деплой успешным.
5. **Public bad token** — `/r/bad-token` должен отдавать generic «ссылка не
   найдена/истекла» состояние, HTTP 200, без утечки имён пациентов/врачей:
   ```bash
   curl -s https://<your-domain>/r/bad-token | grep -o "link-expired"
   # должно найти data-e2e-marker="link-expired"
   ```

Автоматизированный эквивалент шагов 1-5 (кроме визуальной проверки demo-
подсказки) — `npm run e2e-deployment-readiness-check` (сессия 54) и
`npm run e2e-release-candidate-check` (сессия 53) — запускать против
`E2E_BASE_URL=https://<your-domain>` локально с сети, у которой есть доступ
к продакшену, **до** объявления деплоя успешным, если это безопасно
(публичные roдуты + demo-логин, без мутации реальных клинических данных).

## 6. Rollback notes

**Код без миграции схемы** (типичный случай — большинство сессий в этом
проекте не меняют schema.prisma):

```bash
git checkout <previous-commit-or-tag>
npm install
npm run build
# перезапустить процесс (systemd restart / pm2 restart / etc.)
```

БД не трогается — откат кода безопасен и обратим.

**Код + миграция схемы** (реже, см. список миграций в `prisma/migrations/`):

- Prisma Migrate в этом проекте не генерирует автоматические down-миграции.
- Если новая миграция **добавляла** таблицы/колонки (большинство миграций
  в этом проекте — additive) — откат кода безопасен без отката схемы:
  старый код просто не использует новые таблицы/колонки.
- Если новая миграция **изменяла/удаляла** существующие данные — откат
  возможен только через restore backup БД, снятого до миграции (см. §0,
  BACKUP_MONITORING.md §1.2). Откат кода без отката данных в этом случае
  **не безопасен**.
- Правило: backup перед любой миграцией, которая не является чисто
  additive (новая таблица/nullable-колонка) — см. §0 pre-deploy checklist.

## 7. Post-deploy checklist

- [ ] Все 5 smoke tests (§5) прошли.
- [ ] Backup снят ПОСЛЕ успешного деплоя (новая базовая точка восстановления,
      см. BACKUP_MONITORING.md §1.3).
- [ ] Monitoring (uptime-монитор на `/api/health` + `/api/health/db`) —
      подключен/проверен, см. BACKUP_MONITORING.md §5.
- [ ] Если это первый production-деплой реальной клиники — пройти
      PRODUCTION_HARDENING.md §7 чеклист («перед реальным production-
      деплоем») целиком, включая удаление/смену demo-паролей, если seed
      запускался.
- [ ] Залогировано: дата деплоя, коммит/тег, кто деплоил, какие миграции
      применились (для следующего incident response/rollback).

## См. также

- [DEPLOYMENT.md](DEPLOYMENT.md) — полная архитектура деплоя (VPS), требования
  к серверу, обновление, известные ограничения.
- [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md) — Vercel + Neon (публичный demo).
- [BACKUP_MONITORING.md](BACKUP_MONITORING.md) — backup-расписание, retention,
  test restore, monitoring.
- [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) — security pre-flight чеклист.
- [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) — сводный
  release-чеклист v1.0.
