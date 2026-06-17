# Doctor Transfer v1 (сессия 26)

Массовый перевод пациентов и/или предстоящих приёмов от одного врача к другому.
Use-case: врач уходит из клиники, длительный отпуск, реструктуризация.

---

## Модель данных (все поля существовали до сессии 26)

```
Patient.primaryDoctorId  → Doctor (изменяется при transferPatients=true)
Appointment.doctorId     → Doctor (изменяется при transferAppointments=true)
```

---

## Server action `transferDoctor`

`lib/actions/admin.ts`:

1. `requirePermission("admin.manage")`
2. Zod-валидация `transferDoctorSchema` (`fromDoctorUserId`, `toDoctorUserId`, `transferPatients`, `transferAppointments`)
3. Guard: `!transferPatients && !transferAppointments` → `{ error: "nothingSelected" }`
4. Загрузить fromDoctor и toDoctor по `userId + clinicId` (cross-tenant guard встроен)
5. Guard: `fromDoctor.id === toDoctor.id` → `{ error: "sameDoctor" }`
6. `prisma.$transaction(async tx => {...})`:
   - если `transferPatients`: `tx.patient.updateMany({ where: { clinicId, primaryDoctorId: fromDoctor.id }, data: { primaryDoctorId: toDoctor.id } })`
   - если `transferAppointments`: `tx.appointment.updateMany({ where: { clinicId, doctorId: fromDoctor.id, status: { in: ["scheduled","notified","confirmed","reschedule_requested"] }, startsAt: { gte: now }, deletedAt: null }, data: { doctorId: toDoctor.id } })`
7. `audit_log` одна запись: `entityType: "doctor"`, `action: "transfer"`, `before/after`
8. `revalidatePath("/admin")`, `revalidatePath("/patients")`, `revalidatePath("/appointments")`
9. `return { saved: true, patientsMoved, appointmentsMoved }`

### Zod-схема

`lib/validation/admin.ts`:
```ts
export const transferDoctorSchema = z.object({
  fromDoctorUserId:     z.string().uuid("doctorNotFound"),
  toDoctorUserId:       z.string().uuid("doctorNotFound"),
  transferPatients:     z.preprocess((v) => v === "on" || v === true, z.boolean()),
  transferAppointments: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});
```

---

## Helper `getDoctorTransferPreview`

`lib/admin.ts`:
```ts
getDoctorTransferPreview(clinicId: string, fromDoctorId: string): Promise<DoctorTransferPreview>
// → { patientCount: number, upcomingAppointmentCount: number }
```

Два `prisma.count` в `Promise.all`. Используется в `/admin` page для отображения
предварительных цифр под каждым select'ом.

---

## UI-компонент `DoctorTransferForm`

`components/admin/DoctorTransferForm.tsx` — `"use client"`, `useActionState`:

- Props: `doctors: DoctorForTransfer[]`, `dict: Dict["admin"]`
- Два `<select>` (fromDoctorUserId, toDoctorUserId) с preview-строкой под каждым
  (патч через `useState` — обновляется без серверного запроса)
- Два `<input type="checkbox">` (transferPatients, transferAppointments)
- Кнопка «Transferi başlat» отключена пока оба select пустые
- После `state.saved`: «N pasiyent ötürüldü, M qəbul ötürüldü»
- После `state.error`: ошибка из `dict.errors`
- Атрибут `data-e2e-doctor-transfer` на `<form>`

---

## /admin page интеграция

`app/(dashboard)/admin/page.tsx`:

- `DoctorForAdmin` теперь включает `doctorId: string` (Doctor.id)
- Preview загружается в `Promise.all(doctors.map(...))` после основных данных
- Карточка «Həkim transferi» рендерится если `canManage && doctors.length >= 2`

---

## Безопасность

- `fromDoctor` и `toDoctor` загружаются с `{ userId, clinicId: user.clinicId }` —
  cross-clinic доктор вернёт null → `{ error: "doctorNotFound" }`
- `clinicId` в `updateMany` берётся из `user.clinicId` (сессия), не из формы
- Только `admin.manage` может инициировать transfer
- Весь bulk-update в `prisma.$transaction` — атомарный

---

## E2E

`scripts/e2e-doctor-transfer-check.ts` — 12 проверок:

1. Transfer form present in /admin
2. transferPatients → Patient.primaryDoctorId updated in DB
3. After patient transfer: original doctor no longer primary
4. transferAppointments → Appointment.doctorId updated in DB
5. After appointment transfer: original doctor no longer on appointment
6. Nothing selected → nothingSelected error
7. sameDoctor guard → sameDoctor error, DB unchanged
8. Cross-tenant guard → doctorNotFound, DB unchanged
9. patientsMoved=0 when from-doctor has no patients
10. audit_log entry exists after successful transfer
11. Regression: /admin loads (200)
12. Regression: /patients loads (200) and shows Rəşad

---

## Известные ограничения

- **`Assistant.assignedDoctorId` не обновляется при transfer.**
  Ассистенты врача-источника остаются привязанными к нему в БД; переназначение —
  вручную через /admin (Həkim–Assistent секция). JWT-сессия ассистента также
  продолжает содержать старый `assignedDoctorId` до повторного логина.

- **`TreatmentItem.doctorId` не обновляется** — исторические записи (кто провёл
  процедуру). Изменение нарушило бы аудит-след и расчёты комиссий.

- **`TreatmentPlan.doctorId` не обновляется** — исторический автор плана.

- **`ToothRecord.doctorId` не обновляется** — «последний лечащий врач по зубу»,
  историческая запись.

- **Завершённые и отменённые приёмы не переносятся.**
  Только статусы `scheduled`, `notified`, `confirmed`, `reschedule_requested`
  со `startsAt >= now`.

- **Приёмы в статусе `arrived` / `in_progress` / `running_late` не переносятся** —
  массовый перенос активно происходящего приёма опасен для v1.

- **Undo/rollback не реализован** — обратный transfer выполняется вручную
  через ту же форму.

- **Email/push-уведомления пациентам и врачам не отправляются** — out of scope v1.
