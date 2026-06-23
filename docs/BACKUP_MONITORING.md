# Dental Pro CRM — Backup & Monitoring v1

**by AV Systems** · создано в сессии 54 (Deployment / Backup / Monitoring v1)

Этот документ — практическая шпаргалка «как бэкапить и что мониторить».
Механика backup/restore уже была описана в
[DEPLOYMENT.md](DEPLOYMENT.md) §5 — этот файл **не дублирует** команды,
а добавляет то, чего там не было: расписание, retention, проверка
восстановления, аварийный чеклист и monitoring (чего там не было вовсе).
Шаги самого деплоя — [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).

---

## 1. PostgreSQL backup

### 1.1 Команда (см. также DEPLOYMENT.md §5)

```bash
pg_dump -Fc -d dental_pro_crm -f backup_$(date +%Y%m%d_%H%M).dump
```

`-Fc` (custom format) — сжатый, поддерживает выборочное восстановление
через `pg_restore`. Для managed-БД (Neon/RDS/etc.) — используйте встроенный
backup-механизм провайдера, если он есть (см. §1.4); `pg_dump` всё равно
работает как универсальный fallback через `DATABASE_URL`.

### 1.2 Restore

```bash
# Полное восстановление в существующую (пустую) БД:
pg_restore -d dental_pro_crm backup_20260622_1200.dump

# Или создать новую БД и восстановить туда (безопасно для проверки,
# не трогает текущую production-БД, см. §3 «Test restore»):
createdb dental_pro_crm_restore_test
pg_restore -d dental_pro_crm_restore_test backup_20260622_1200.dump
```

Порядок восстановления полной системы (БД + файлы + конфиг) — см.
DEPLOYMENT.md §5 «Порядок восстановления» (важен из-за relative path
`fileUrl`, который должен совпасть со старой структурой `uploads/`).

### 1.3 Расписание (рекомендация)

| Окружение | Частота | Время |
|---|---|---|
| Production (реальная клиника) | ежедневно | вне рабочих часов клиники (рабочие часы клиники задаются в Ayarlar — обычно ночь по `clinic.timezone`) |
| Demo/staging | необязательно (данные восстанавливаемы через `npm run db:seed`) | — |

Если используется managed PostgreSQL (Neon/RDS/Cloud SQL) —
проверьте встроенный automated backup провайдера (см. §1.4) **до** того,
как настраивать собственный cron — может закрывать это требование без
дополнительного скрипта.

### 1.4 Retention (рекомендация)

- **Ежедневные** бэкапы — хранить минимум 7 дней.
- **Еженедельные** (например, бэкап по понедельникам) — хранить минимум
  4 недели.
- **Ежемесячные** — хранить минимум 6–12 месяцев (зависит от требований
  клиники/договора; финансовые данные — invoices/payments/debts —
  предполагают более долгий retention, чем чисто операционные данные).
- Хранить бэкапы **отдельно от сервера приложения** (другой диск/регион/
  managed object storage) — локальный бэкап на том же диске не защищает от
  отказа диска/сервера целиком.

> **Managed Postgres (Neon/RDS/Cloud SQL и т.п.)**: у большинства провайдеров
> уже есть automated daily backups + point-in-time recovery на платных
> тарифах — это закрывает §1.3–1.4 без дополнительной настройки. Проверьте
> тариф перед тем, как настраивать собственный `pg_dump`-cron.

## 2. Backup `uploads/`

- **Ограничение**: `uploads/` — локальный диск (`lib/storage.ts`), не S3.
  Подходит только для self-hosted/VPS с постоянным диском (см. DEPLOYMENT.md §1).
- **VPS/local**: бэкапить каталог целиком вместе с БД (`tar`/`rsync`),
  **в одно и то же время** или близко к моменту `pg_dump` — расхождение
  между бэкапом БД и бэкапом файлов означает часть `fileUrl`-записей будет
  указывать на файлы из другого момента времени.
  ```bash
  tar -czf uploads_backup_$(date +%Y%m%d_%H%M).tar.gz uploads/
  ```
- **Vercel/serverless**: `uploads/` не сохраняется между деплоями
  (ephemeral FS) — backup каталога **не применим**, потому что сами файлы
  не живут дольше одного запроса/деплоя. Для production-клиники на
  serverless нужен сначала перенос storage на S3-совместимый сервис
  (единственная точка замены — `lib/storage.ts`, см. DOCUMENTS.md/
  DEPLOYMENT.md §1) — это **future work**, не в этой сессии.

## 3. Test restore (рекомендация)

Backup, который никогда не восстанавливался — это не backup, а
предположение. Рекомендация:

- Минимум **раз в квартал** (или после крупного изменения схемы/миграции)
  восстановить последний backup в отдельную тестовую БД (`createdb ..._restore_test`,
  см. §1.2) и проверить:
  - `npx prisma migrate status` против восстановленной БД — миграции
    совпадают с текущей schema.prisma;
  - ключевые таблицы непустые (`SELECT count(*) FROM patients;` и т.п.);
  - приложение стартует против восстановленной БД локально
    (`DATABASE_URL` указывает на `..._restore_test`) и `/api/health/db`
    отдаёт `{"ok":true}`.
- Удалить тестовую БД после проверки (`dropdb ..._restore_test`).

## 4. Аварийный чеклист восстановления (emergency recovery)

Если production недоступен / данные повреждены:

1. **Не паниковать, не перезаписывать** текущую (повреждённую) БД до
   копирования её текущего состояния (даже повреждённая БД может содержать
   восстановимые данные — `pg_dump` её перед любым destructive-действием,
   если это возможно).
2. Найти последний валидный backup (по дате + §3 test-restore статусу, если
   тестировался).
3. Восстановить PostgreSQL: `pg_restore -d <new_db> backup.dump` (в НОВУЮ БД,
   не перезаписывая текущую, до проверки).
4. Восстановить `uploads/` в тот же относительный путь (см. §2; не
   применимо для serverless).
5. Проверить целостность: `npx prisma migrate status`, выборочные запросы
   по ключевым таблицам.
6. Переключить `DATABASE_URL` на восстановленную БД, перезапустить
   приложение (`npm run start` / supervisor restart).
7. Прогнать smoke-тесты — см. [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)
   §«Smoke tests» (login, dashboard, `/api/health`, `/api/health/db`,
   `/r/bad-token`).
8. Сообщить клинике о времени простоя и о том, какие данные (если есть)
   могут отсутствовать (период между последним backup и инцидентом).

## 5. Что и кого мониторить

| Что | Как | Зачем |
|---|---|---|
| `GET /api/health` | Uptime-монитор (UptimeRobot/Healthchecks.io/Grafana и т.п.), интервал 1–5 мин | Сервис жив (процесс отвечает), не зависит от БД — отличает «сервис упал» от «БД упала» |
| `GET /api/health/db` | Тот же монитор, отдельная проверка | Реальное подключение к Postgres; `503` = БД недоступна |
| Свободное место на диске (`uploads/` + БД) | `df -h` вручную или через server-level monitoring (Netdata/node_exporter и т.п.) | `uploads/` растёт со сканами/PDF; диск 100% = upload/build начинают падать |
| Server-логи (`console.error` из server actions/health routes) | journalctl/pm2 logs/docker logs — куда настроен вывод процесса | Все server actions логируют ошибки через `console.error` (см. PRODUCTION_HARDENING.md §5) — единственное место, где видна причина 500-х/неудачных операций |
| Возраст последнего успешного backup | Ручная проверка по расписанию (§1.3) или скрипт, пишущий timestamp после `pg_dump` | Backup, который тихо перестал запускаться — хуже, чем отсутствие backup, потому что создаёт ложное чувство защищённости |
| SSL-сертификат (если self-hosted + свой reverse proxy) | Let's Encrypt auto-renew или ручной мониторинг срока действия | Истёкший TLS = `secure` cookie не работает = логин ломается в production (см. DEPLOYMENT.md §6) |

**Кто отвечает**: на VPS-деплое — администратор сервера (доступ к cron/systemd/
дискам). На Vercel+Neon demo — у Neon/Vercel есть собственные dashboard-метрики
(connections, storage, function duration) — использовать их вместо
самостоятельного мониторинга диска/процесса, т.к. сервер не ваш.

## 6. Что НЕ входит в v1 (future work)

- Автоматизация (cron job) самого backup — **документирована, не настроена**
  в этой сессии: конкретный cron/systemd-timer зависит от целевого сервера,
  настраивается администратором при реальном деплое.
- Платная интеграция мониторинга (Datadog/Sentry/PagerDuty и т.п.) — не
  входит, см. PRODUCTION_HARDENING.md §10 «Рекомендуемые будущие аудиты».
- Object storage (S3/R2/MinIO) для `uploads/` — future, см. §2.
- Point-in-time recovery «из коробки» — зависит от managed-провайдера
  (см. §1.4), не реализуется в коде приложения.

## См. также

- [DEPLOYMENT.md](DEPLOYMENT.md) §5 — механика backup/restore команд.
- [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) — шаги самого деплоя +
  smoke-тесты + rollback.
- [PRODUCTION_HARDENING.md](PRODUCTION_HARDENING.md) — security-аудит,
  §10 — рекомендуемые будущие внешние аудиты/инструменты.
- [RELEASE_CANDIDATE_CHECKLIST.md](RELEASE_CANDIDATE_CHECKLIST.md) §D/G —
  deployment checklist и приоритеты до v1.0.
