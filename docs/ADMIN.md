# Admin v1 (сессия 17)

Клиничный раздел `/admin` — управление кадрами и ролями текущей клиники.
Заменяет прежний платформенный placeholder (`requireRole("super_admin")`).

## Доступ

- `/admin` — `admin.view`.
- Мутации (смена роли, статус, создание сотрудника) — `admin.manage`.
- По дефолту `admin.view`/`admin.manage` есть у `owner` и `admin`
  (см. `ALL_CLINIC` в `lib/permissions.ts` — теперь включает модуль `admin`).
- `super_admin` (`clinicId: null`) — нет клиники для управления кадрами,
  `/admin` делает `redirect("/dashboard")`; в sidebar пункт "Admin" виден
  только при `user.clinicId` (см. `components/layout/nav.ts`).

## Что поддерживает v1

### 1. Список сотрудников клиники
Имя, e-mail, телефон, роль, статус (Aktiv/Deaktiv), дата регистрации,
последний вход (`lastLoginAt`, "—" если ещё не входил). Только пользователи
текущей клиники (`clinicId`), `super_admin`-строки не отображаются.

### 2. Смена роли (`admin.manage`)
Inline select + «Yadda saxla» в строке сотрудника. Доступные роли —
все системные роли, кроме `super_admin` (`ASSIGNABLE_ROLES`:
owner, admin, doctor, reception, assistant, accountant).

### 3. Статус (активен/деактивирован)
Кнопка «Deaktiv et» / «Aktivləşdir» (`admin.manage`). Использует
существующее поле `User.isActive`. Деактивированный пользователь не
может войти — `lib/actions/auth.ts` уже проверяет `user.isActive` при логине
(без изменений в этой сессии). Hard delete не реализован и не планируется.

### 4. Создание сотрудника (`admin.manage`)
Форма "Yeni əməkdaş": имя, e-mail, телефон (опц.), роль. Генерируется
случайный временный пароль (12 символов, bcrypt-хэш), показывается **один раз**
сразу после создания — администратор должен передать его сотруднику вручную.
Email-инвайтов и password-reset потока нет (out of scope v1).

## Permissions

`admin.view` / `admin.manage` уже существовали в каталоге (`MODULES` включает
`"admin"`), но не были назначены клиничным ролям. Изменение — только в
`lib/permissions.ts`: `ALL_CLINIC` теперь включает модуль `admin`, поэтому
`owner`/`admin` получают `admin.view`+`admin.manage` через
`DEFAULT_ROLE_PERMISSIONS`. После изменения выполнен `npm run db:seed`
(upsert `role_permissions`, идемпотентно — старые права не удаляются).
**schema.prisma не менялась** — все нужные поля (`User.isActive`, `Role`,
`Permission`, `RolePermission`, `RoleKey`) уже существовали.

## Tenant / безопасность

- Все запросы — `prisma.user.findFirst({ where: { id, clinicId: user.clinicId, deletedAt: null } })`
  перед любой мутацией: цель обязана принадлежать клинике текущего пользователя.
- `clinicId` всегда берётся из сессии (`user.clinicId`), никогда из формы.
- `super_admin`-пользователи невидимы и не редактируемы из `/admin`
  (`role.key !== "super_admin"` фильтр в `listStaff`/`listAssignableRoles`,
  плюс явная проверка в каждой server action).
- Любая мутация пишет `audit_log` (`entityType: "user"`, `before`/`after`).

## Self-lockout protection

- **Смена роли**: если у целевого пользователя роль `owner`/`admin` и новая
  роль — не `owner`/`admin`, проверяется `countActiveAdmins(clinicId, excludeTargetId)`.
  Если результат `0` — ошибка `lastAdmin`, роль не меняется. Действует и
  при попытке самостоятельной демоции.
- **Деактивация**: аналогичная проверка для последнего активного owner/admin
  (`lastAdmin`). Кроме того, пользователь **не может деактивировать себя**
  (`selfLockout`) — кнопка статуса не отображается в собственной строке.

## Out of scope (v1)

- Subscription/billing, payment plans.
- Multi-clinic super-admin консоль (платформенный admin).
- Audit-аналитика/дашборд.
- Редактор матрицы прав (UserPermission per-permission UI) — только смена роли целиком.
- Email-инвайты, password reset, внешний auth provider.
- S3/storage миграция.
- Hard delete пользователей.

## Известные ограничения

- Деактивация проверяется только при login (`isActive` снимается в момент
  входа). Уже выданная JWT-сессия деактивированного пользователя остаётся
  валидной до истечения (12 ч) — как и у permission-снимка в `SessionUser`.
  Полная инвалидация активных сессий потребовала бы server-side session store
  (out of scope v1).
- Временный пароль создаётся один раз и не сохраняется — если администратор
  не зафиксировал его, единственный путь восстановления — пересоздать
  пароль через прямой доступ к БД (UI password-reset нет, см. out of scope).
- "Last activity" = `User.lastLoginAt` (момент логина), отдельного
  activity-лога нет.
