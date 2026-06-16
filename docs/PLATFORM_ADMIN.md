# Platform Admin v1 (сессия 24)

Платформенный раздел `/platform/clinics` — управление клиниками и их пользователями.
Доступен **только** `super_admin` (проверка через `requireRole("super_admin")`).

## Роль super_admin

- `clinicId: null` — не принадлежит ни одной клинике.
- В сессии: `role: "super_admin"`, все `platform.*` + `admin.*` разрешения.
- Логин: `super@demo.dentalpro.az` / `Demo1234!` (локально), или алиас `super`.
- Не может попасть в `/admin` (clinicId null → redirect /dashboard).
- Аудит-события записываются с `clinicId: null` (платформенный уровень).
- `super_admin`-пользователи **не доступны** ни в `/admin` клиники, ни в платформенном
  UI (`role.key === "super_admin"` фильтруется везде; нельзя менять пароль/логин
  super_admin через UI — действие возвращает `{ error: "notFound" }`).

## Маршруты

| Путь | Компонент | Описание |
|---|---|---|
| `/platform/clinics` | `ClinicListTable` + `CreateClinicForm` | Список всех клиник |
| `/platform/clinics/[id]` | `ClinicStatusControl` + `CreateClinicUserForm` + `ClinicUserList` | Детали + управление |

## Что поддерживает v1

### 1. Список клиник
Все клиники с именем, статусом, типом (`clinic`/`solo_doctor`), количеством
активных пользователей, ссылкой «Manage» на детали.

### 2. Создание клиники (`createClinic`)
Форма в `/platform/clinics`: имя, тип, телефон, email, адрес + данные первого
администратора (имя, email, пароль). Операция атомарная (`prisma.$transaction`):
- Создаётся `Clinic` (status: active, slug из имени — unique с суффиксом).
- Создаётся `User` с ролью `owner`, привязанный к новой клинике.
- Временный пароль показывается один раз в UI после создания.
- Audit_log: `{ clinicId: null, entityType: "clinic", after: { name, adminEmail } }`.

### 3. Статус клиники (`setClinicStatus`)
`ClinicStatusControl` на странице деталей — переключает `active ↔ suspended`.
Suspended клиника: попытка логина любого её пользователя возвращает
`{ error: "clinicSuspended" }` и показывает локализованное сообщение
"Klinika müvəqqəti dayandırılıb. Əlaqə saxlayın."

### 4. Добавить пользователя в клинику (`platformCreateUser`)
Форма `CreateClinicUserForm` — `clinicId` берётся из URL (параметр `[id]`),
не из формы. Имя, email, телефон, роль, временный пароль.

### 5. Сброс пароля (`platformResetPassword`)
Inline-форма в `ClinicUserList` для каждого пользователя.
Новый пароль хэшируется bcrypt, сохраняется; старые сессии не инвалидируются
(TTL 12 ч — известное ограничение).

### 6. Смена логина (`platformChangeLogin`)
Inline-форма в `ClinicUserList`. Проверяет уникальность нового email.
После смены старый email перестаёт работать немедленно (новый логин требуется
при следующем входе, существующая сессия остаётся валидной до 12 ч).

### 7. Деактивация / активация пользователя (`platformToggleUserStatus`)
Кнопка в `ClinicUserList`. Self-lockout: нельзя деактивировать последнего
активного owner/admin клиники (`countActiveAdmins` → `lastAdmin`).

## Permissions

`platform.view` / `platform.manage` добавлены в `MODULES` и назначены
`super_admin` через `DEFAULT_ROLE_PERMISSIONS`. Модуль `platform` отображается
в sidebar только при `perm: "platform.view"` и `clinicOnly: false`.

## Tenant / безопасность

- Все платформенные actions используют `prisma` напрямую (не `tenantClient`):
  super_admin имеет доступ ко всем клиникам.
- Каждый action начинается с `requireRole("super_admin")` — не roleKey из сессии,
  а server-side проверка на каждый запрос.
- Нельзя через платформенный UI редактировать `super_admin`-пользователей
  (явная проверка `target.role.key === "super_admin" → notFound`).
- `clinicId` в `platformCreateUser` берётся из URL (`params.id` → server component),
  не из скрытого input формы.
- Все мутации пишут `audit_log` с `clinicId: null`.

## Schema (миграция сессии 24)

**`20260616201010_add_clinic_type`**:
```prisma
enum ClinicType { clinic  solo_doctor }
// Clinic model:
clinicType  ClinicType  @default(clinic)  @map("clinic_type")
```

## ClinicType

| Значение | Смысл |
|---|---|
| `clinic` | Многоврачебная клиника (по умолчанию) |
| `solo_doctor` | Кабинет одного врача |

Влияет только на отображение в /platform (бейдж тип). Логика приёмов/расписания
не меняется в v1.

## Seed

```ts
await upsertUser({
  email: "super@demo.dentalpro.az",
  fullName: "Super Admin",
  clinicId: null,
  roleId: roleIds.super_admin!,
  passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 10),
});
```

Алиас `super` → `super@demo.dentalpro.az` добавлен в `LOGIN_ALIASES` в
`lib/actions/auth.ts`.

## Известные ограничения

- Деактивация пользователя / смена пароля не инвалидирует уже выданные JWT-сессии
  (TTL 12 ч). Полная инвалидация потребует server-side session store (out of scope).
- Нет pagination для списка клиник/пользователей (MVP — для масштаба v2).
- Нет bulk-операций.
- Клинику нельзя удалить через UI (только через БД).
- Нет email-уведомлений при создании клиники/пользователя (временный пароль —
  ручная передача).

## Out of scope (v1)

- Billing / subscription management.
- Quota на число пользователей/пациентов.
- Transfer пациентов между клиниками.
- Платформенная аналитика / дашборд.
- SSO / OAuth / SAML.
