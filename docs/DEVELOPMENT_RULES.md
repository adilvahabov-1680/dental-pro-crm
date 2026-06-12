# Dental Pro CRM — Development Rules
**by AV Systems** · v1.1 · 2026-06-11
Связанные документы: [PROJECT.md](PROJECT.md) · [DESIGN.md](DESIGN.md) · [DATABASE.md](DATABASE.md) · [DENTAL_CHART.md](DENTAL_CHART.md) · [SETUP.md](SETUP.md)

## Десять обязательных правил

1. **Никогда не делать запросы без tenant-фильтра.** Бизнес-запросы — только через `db()` / `tenantClient(clinicId)` из `lib/tenant.ts` (clinic_id добавляется автоматически). **Запрещены `findUnique`/`update`/`delete` по голому id без tenant-валидации** — для точечных операций использовать safe-хелперы: `safeFindFirstByTenant`, `safeUpdateByTenant`, `safeDeleteByTenant` (бросают `TenantAccessError` на чужой записи; для моделей с `deleted_at` — soft delete через `safeUpdateByTenant`). `prisma` напрямую — только auth-код, seed/скрипты и `/admin` (super_admin). Изоляция проверяется скриптом `npx tsx scripts/tenant-check.ts`.
2. **Никогда не показывать данные другой клиники.** Любой id из URL/формы проверяется на принадлежность тенанту (`canAccessClinic`, `canAccessDoctorData`). Файлы — только подписанные URL после проверки.
3. **Все новые таблицы получают `clinic_id`**, если данные принадлежат клинике (см. DATABASE.md §0), и добавляются в `TENANT_MODELS` в `lib/tenant.ts`.
4. **Все модули проверяют role/permission на сервере**: страница начинается с `requirePermission("<module>.view")` (или `requireRole`); мутации проверяют `<module>.manage`. UI только скрывает — не защищает. **Чек-лист перед созданием любого реального модуля:** (а) permission-ключи есть в каталоге и seed; (б) страница — `requirePermission`; (в) все запросы — через `db()`/safe-хелперы; (г) точечные операции валидируют тенанта; (д) для doctor/assistant учтён scope (`canAccessDoctorData`).
5. **Не менять schema.prisma без причины.** Любое изменение: причина → минимальная правка → обновление DATABASE.md → `prisma validate`.
6. **Не переписывать layout без задачи.** Sidebar/Topbar/DashboardLayout меняются только когда этого требует текущая задача.
7. **Не ломать design system.** Только токены из `app/globals.css` (никаких hex в компонентах), только Lucide-иконки, компоненты из `components/ui`. Новый визуальный паттерн = сначала компонент, потом использование.
8. **Все изменения — маленькими шагами.** Один модуль за итерацию; не переписывать работающее; не делать «заодно».
9. **После каждого этапа — список изменённых файлов**, что добавлено, что проверить вручную, риски.
10. **Dental Chart: каждый зуб — отдельный активный элемент** в будущем UI (клик → карточка зуба; статус/история/план — по зубу). Данные уже соответствуют: `dental_charts → tooth_records → tooth_history`.

## Auth & permissions (как устроено)

- Сессия: JWT (jose, HS256) в httpOnly cookie `dp_session`, TTL 12ч. Edge-safe код — `lib/session.ts`; server-хелперы — `lib/auth.ts` (`getCurrentUser`, `requireAuth`, `requireRole`, `requirePermission`).
- Права считаются при логине: `role_permissions ∪ (user_permissions allowed) − (user_permissions denied)` (`resolveEffectivePermissions`) и кладутся снимком в JWT.
- **Известный риск (принят для MVP):** JWT-снимок прав действует до перелогина (макс. 12ч TTL). Отзыв права/блокировка пользователя вступают в силу при следующем входе. TODO (после MVP): refresh permissions из БД при чувствительных операциях или короткий TTL + sliding refresh. Не усложнять сейчас.
- Защита маршрутов: `middleware.ts` (1-й слой) + `requireAuth` в `(dashboard)/layout.tsx` (2-й слой) + `requirePermission` на страницах (3-й слой).
- **AUTH_MOCK:** `false` = реальный вход через Prisma + bcrypt (текущий режим). `true` — только аварийный dev-режим без БД; **обязан быть `false` перед любым production-развёртыванием** (проверять перед деплоем). Mock-ветку в `lib/actions/auth.ts` и `DEMO_USERS` в `lib/constants.ts` удалить окончательно после стабилизации.
- **Demo-креды — только локальная разработка** (см. SETUP.md §6); в production demo-пользователи удаляются/меняются, в БД хранятся только bcrypt-хэши.

## PostgreSQL / migration / seed

См. [SETUP.md](SETUP.md). Коротко: `docker compose up -d` ИЛИ `scripts\db-start.ps1` (портативная) → `npx prisma migrate deploy` → `npm run db:seed` (идемпотентен) → проверка `npx tsx scripts/tenant-check.ts`. Dev-страница `/dev-check` доступна только в development (в production — 404).

## Команды

```bash
npm run dev          # дев-сервер
npm run build        # production-сборка — НЕ запускать при работающем dev-сервере
                     # (build перезаписывает .next и ломает чанки dev-сервера)
npm run typecheck    # tsc --noEmit
npm run db:validate  # prisma validate
npm run db:migrate   # prisma migrate dev   (нужна PostgreSQL)
npm run db:seed      # demo seed            (нужна PostgreSQL + миграции)
npx tsx scripts/tenant-check.ts        # изоляция тенантов на живой БД
npx tsx scripts/e2e-patients-check.ts  # e2e модуля Pasiyentlər (нужен dev-сервер)
```

## Соглашения кода

- Server Components по умолчанию; `"use client"` — только где нужны хуки/события (Sidebar, LoginForm).
- Мутации — server actions в `lib/actions/<module>.ts` с валидацией входа.
- Строки UI — только из `i18n/az.ts` через `getDict(locale)`; добавление RU/EN = новые файлы словарей, компоненты не меняются.
- Деньги — int в гяпиках (`formatMoney`), даты — UTC в БД.
- Statuses: AZ-метки и цвета enum'ов — `lib/constants.ts` (`TOOTH_STATUS_META`, `APPOINTMENT_STATUS_META`); не дублировать в компонентах.
