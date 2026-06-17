# Admin v1 (сессия 17, обновлено в сессиях 24, 25)

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
Email-инвайтов нет (out of scope v1).

### 5. Сброс пароля (`admin.manage`, добавлено в сессии 24)
Inline-форма «Şifrəni sıfırla» в строке каждого сотрудника в таблице.
Клиник-администратор вводит новый пароль → bcrypt-хэш сохраняется.
Audit_log: `{ after: { passwordReset: true } }`.
Ограничение: нельзя сбросить пароль `super_admin`-пользователя (action
возвращает `notFound`).

### 6. Смена логина (email) (`admin.manage`, добавлено в сессии 24)
Inline-форма «Giriş e-poçtunu dəyiş» в строке сотрудника.
Проверяет уникальность нового email. Новый email вступает в силу
немедленно (следующий логин — с новым email); существующая JWT-сессия
сотрудника остаётся валидной до TTL 12 ч.
Audit_log: `{ before: { email: old }, after: { email: new } }`.

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

### 7. Назначение врача–ассистента (`admin.manage`, добавлено в сессии 25)

Карточка «Həkim–Assistent bağlantıları» ниже таблицы сотрудников.
По каждому активному Doctor-профилю клиники — его ассистенты + dropdown
свободных ассистентов для привязки.

- `assignDoctorAssistant`: привязывает `Assistant.assignedDoctorId = doctor.id`.
  Идемпотентно (уже привязан → `{ saved: true }`).
- `removeAssistantLink`: обнуляет `Assistant.assignedDoctorId`.
  Идемпотентно (уже null → `{ saved: true }`).
- Cross-tenant: оба userId обязаны принадлежать текущей клинике.
- Изменение вступает в силу при **следующем логине** ассистента
  (assignedDoctorId бекается в JWT, TTL 12 ч).

### 8. Авто-создание Doctor/Assistant профиля (`admin.manage`, добавлено в сессии 25)

До сессии 25: `createStaffUser` и `changeStaffRole` оставляли пользователя
без Doctor/Assistant профиля при назначении роли `doctor`/`assistant`.

Теперь оба action делают upsert после мутации:
- `role = "doctor"` → `prisma.doctor.upsert({ where: { userId } })` (цвет `#22d3ee`)
- `role = "assistant"` → `prisma.assistant.upsert({ where: { userId } })`

Idempotent: повторный вызов не меняет существующий профиль.

### 9. Назначение врача пациенту (`admin.manage`, добавлено в сессии 25)

Карточка пациента `/patients/[id]` → строка «Məsul həkim» → inline select + кнопка.

- `assignPatientDoctor`: обновляет `Patient.primaryDoctorId`.
  Можно передать doctorId=null для снятия врача.
- Cross-tenant: пациент и врач обязаны принадлежать клинике текущего пользователя.
- Колонка врача в `/patients` уже существовала (поле включено в listInclude).

Детали — `docs/DOCTOR_ASSISTANT_ASSIGNMENT.md`.

## Out of scope (v1)

- Subscription/billing, payment plans.
- Multi-clinic super-admin консоль — реализовано в PLATFORM_ADMIN.md (сессия 24).
- Audit-аналитика/дашборд.
- Редактор матрицы прав (UserPermission per-permission UI) — только смена роли целиком.
- Email-инвайты, внешний auth provider.
- S3/storage миграция.
- Hard delete пользователей.

## Известные ограничения

- Деактивация и сброс пароля / смена логина не инвалидируют уже выданные
  JWT-сессии (TTL 12 ч). Полная инвалидация потребует server-side session store
  (out of scope v1).
- Временный пароль при создании сотрудника показывается один раз и не сохраняется.
  Если не зафиксирован — клиник-администратор может сбросить пароль через форму
  «Şifrəni sıfırla» (добавлена в сессии 24), задав новый.
- "Last activity" = `User.lastLoginAt` (момент логина), отдельного
  activity-лога нет.
