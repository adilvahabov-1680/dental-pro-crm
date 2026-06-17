# Doctor & Assistant Assignment v1 (сессия 25)

Управление связями «Məsul həkim» (ответственный врач) и «Həkim–Assistent».
Реализовано поверх уже существующих полей схемы — migration не требовалась.

---

## Модель данных (все поля существовали до сессии 25)

```
Patient.primaryDoctorId  → Doctor (именованная связь "PrimaryDoctor")
Assistant.assignedDoctorId → Doctor
Doctor.assistants         → Assistant[] (обратная связь)
```

---

## 1. Назначение врача пациенту (Məsul həkim)

### Где
Карточка пациента `/patients/[id]` → блок «Əsas məlumat» → строка «Məsul həkim».

### Кто может
Только `admin.manage` (owner/admin). Врач и ассистент видят имя текущего врача,
но форму не получают.

### Как
Компонент `AssignDoctorForm` (`components/patients/AssignDoctorForm.tsx`):
- select со всеми активными врачами клиники + опция «Təyin olunmayıb» (null)
- `useActionState(assignPatientDoctor)` — нет промежуточного стейта, сразу persistent

### Server action `assignPatientDoctor`
`lib/actions/admin.ts`:
1. `requirePermission("admin.manage")`
2. Zod-валидация `assignPatientDoctorSchema` (`patientId: uuid, doctorId?: uuid`)
3. Cross-tenant: `patient.clinicId === user.clinicId` и (если doctorId) `doctor.clinicId === user.clinicId`
4. `prisma.patient.update({ data: { primaryDoctorId: doctorId } })` через tenant client
5. `audit_log` (`entityType: "patient"`, before/after)
6. `revalidatePath("/patients/[id]")`

### Список пациентов
`/patients` уже включал `primaryDoctor` в `listInclude` до сессии 25 — колонка врача
в таблице работала без изменений.

---

## 2. Назначение ассистента к врачу (Həkim–Assistent)

### Где
`/admin` → карточка «Həkim–Assistent bağlantıları» под таблицей сотрудников
(только при `admin.manage`).

### Логика UI
Компонент `DoctorAssistantsCard` (`components/admin/DoctorAssistantsCard.tsx`):
- По каждому активному врачу клиники — его ассистенты (RemoveAssistantForm)
  + dropdown ассистентов, ещё НЕ привязанных к этому врачу (AssignAssistantForm)
- Если ни одного врач-профиля → «Klinikada aktiv həkim profili yoxdur»

### Server action `assignDoctorAssistant`
`lib/actions/admin.ts`:
1. `requirePermission("admin.manage")`
2. Zod: `assistantUserId: uuid, doctorUserId: uuid`
3. Cross-tenant: оба пользователя в `user.clinicId`
4. Загрузить Doctor/Assistant профили
5. Идемпотентный guard: `if (assistant.assignedDoctorId === doctor.id) return { saved: true }`
6. `prisma.assistant.update({ data: { assignedDoctorId: doctor.id } })`
7. audit_log + revalidatePath("/admin")

### Server action `removeAssistantLink`
1. `requirePermission("admin.manage")`
2. Zod: `assistantUserId: uuid`
3. Загрузить assistant по `userId + clinicId`
4. Идемпотентный guard: `if (!assistant.assignedDoctorId) return { saved: true }`
5. `prisma.assistant.update({ data: { assignedDoctorId: null } })`
6. audit_log + revalidatePath("/admin")

---

## 3. Авто-создание профилей при смене роли

**До сессии 25**: `createStaffUser` и `changeStaffRole` создавали пользователя
и меняли роль, но Doctor/Assistant profile приходилось создавать вручную.

**После сессии 25**: оба action делают upsert после успешной мутации:

```ts
// При role = "doctor":
await prisma.doctor.upsert({
  where: { userId: user.id },
  create: { clinicId: user.clinicId, userId: user.id, color: "#22d3ee" },
  update: {},
});
// При role = "assistant":
await prisma.assistant.upsert({
  where: { userId: user.id },
  create: { clinicId: user.clinicId, userId: user.id },
  update: {},
});
```

Идемпотентно: если профиль уже существует — ничего не меняется.

---

## 4. Scope пациентов (без изменений)

`patientScopeWhere` и `appointmentScopeWhere` **не менялись** — они уже были
реализованы корректно:

| Роль | `doctor_sees_all_patients=false` | `=true` |
|------|----------------------------------|---------|
| doctor | `{ primaryDoctorId: user.doctorId }` | `{}` |
| assistant | `{ primaryDoctorId: user.assignedDoctorId }` | `{}` |
| owner/admin/reception/accountant | `{}` | `{}` |

**Важно**: `assignedDoctorId` читается из JWT-сессии (снимок на момент логина).
Изменение привязки в БД вступает в силу при следующем логине ассистента.

---

## 5. Безопасность

- Назначение врача пациенту → `patient.clinicId` и `doctor.clinicId` обязаны совпадать
  с `user.clinicId`. Нельзя назначить врача из другой клиники.
- Назначение ассистента к врачу → оба userId обязаны принадлежать `user.clinicId`.
- Все мутации требуют `admin.manage`.
- Все мутации пишут `audit_log`.
- `patientScopeWhere` защищает данные на уровне read-запросов.

---

## 6. E2E

`scripts/e2e-doctor-assistant-assignment-check.ts` — 28 проверок (15 логических групп):

1. Форма «Məsul həkim» есть на карточке пациента (admin.manage)
2. После assign: patient.primaryDoctorId обновлён в БД
3. Врач видит пациента при `doctor_sees_all_patients=false`
4. Другой врач не видит (DB-scope проверка)
5. `doctor_sees_all_patients=true` открывает всем врачам
6. Cross-tenant: нельзя назначить врача из другой клиники (DB-проверка)
7. Форма «Həkim–Assistent» есть в /admin для активного врача
8. После assign: assistant.assignedDoctorId обновлён в БД
9. Ассистент видит пациентов своего врача
10. Ассистент не видит пациента другого врача (контент отсутствует)
11. Дублирующий assign идемпотентен
12. После unlink + re-login: ассистент не видит ранее доступного пациента
13–15. Регрессия: patients / appointments / treatments / admin / platform

**E2E-quirk**: `notFound()` в Next.js 15 dev возвращает HTTP 200 (не 404).
Тест проверяет отсутствие контента пациента в теле ответа, а не статус.

---

## 7. Вспомогательные функции

`lib/admin.ts`:
- `listDoctorsForAdmin(clinicId)` → `DoctorForAdmin[]` (с `linkedAssistants`)
- `listAssistantUsersForAdmin(clinicId)` → `AssistantUserForAdmin[]` (с `linkedDoctorUserId`)

`lib/validation/admin.ts`:
- `assignPatientDoctorSchema`
- `assignDoctorAssistantSchema`
- `removeAssistantLinkSchema`

`i18n/az.ts` → `admin.assignment.*`, `admin.errors.crossTenantDoctor/crossTenantAssistant/...`
