# Treatment Protocols & Follow-up Scheduling

**by AV Systems** · добавлено в сессии 22

Модуль шаблонов лечения (Treatment Protocols) позволяет клинике создавать стандартные
протоколы — наборы шагов (услуг) — и применять их к плану лечения пациента.
Кроме этого, из любой запланированной процедуры можно одним кликом запланировать
следующий приём (follow-up), с подсказками свободных слотов.

---

## 1. Модели БД

### `TreatmentProtocol` (`treatment_protocols`)

| Поле          | Тип      | Описание                                         |
|---------------|----------|--------------------------------------------------|
| `clinicId`    | UUID     | Tenant-изоляция                                 |
| `name`        | String   | Название протокола                               |
| `description` | String?  | Краткое описание                                 |
| `isActive`    | Boolean  | Активен / деактивирован                          |
| `sortOrder`   | Int      | Порядок в списке                                 |
| `deletedAt`   | DateTime?| Soft delete                                      |

### `TreatmentProtocolStep` (`treatment_protocol_steps`)

| Поле           | Тип      | Описание                                        |
|----------------|----------|-------------------------------------------------|
| `clinicId`     | UUID     | Tenant-изоляция                                |
| `protocolId`   | UUID     | FK → TreatmentProtocol                         |
| `serviceId`    | UUID     | FK → Service                                   |
| `orderIndex`   | SmallInt | Порядок шага (0-based)                          |
| `durationMin`  | SmallInt?| Переопределение времени из Service.durationMin  |
| `intervalDays` | SmallInt?| Дней после предыдущего шага (для follow-up)    |
| `notes`        | String?  | Заметка по шагу                                 |
| `deletedAt`    | DateTime?| Soft delete                                     |

---

## 2. Файлы

| Путь | Назначение |
|------|-----------|
| `lib/protocols.ts` | `listProtocols`, `listActiveProtocols`, `getProtocolForClinic`, `findAvailableAppointmentSlots` |
| `lib/actions/protocols.ts` | Server actions: `createProtocol`, `toggleProtocolActive`, `deleteProtocol`, `addProtocolStep`, `deleteProtocolStep`, `applyProtocol`, `scheduleFollowUp` |
| `lib/validation/protocols.ts` | Zod-схемы: `protocolCreateSchema`, `protocolStepSchema`, `applyProtocolSchema`, `scheduleFollowUpSchema` |
| `app/(dashboard)/settings/protocols/page.tsx` | Страница управления протоколами |
| `components/protocols/ProtocolCreateForm.tsx` | Форма создания протокола |
| `components/protocols/ProtocolList.tsx` | Список протоколов с управлением шагами |
| `components/protocols/ApplyProtocolForm.tsx` | Форма применения протокола к плану |
| `components/treatments/FollowUpScheduleForm.tsx` | Форма планирования следующего приёма |
| `app/(dashboard)/treatments/[id]/followup/page.tsx` | Страница follow-up scheduling |

---

## 3. Управление протоколами (`/settings/protocols`)

- Доступно при `settings.view` (чтение) и `settings.manage` (создание/изменение)
- **Создание**: форма вверху страницы (name + description)
- **Шаги**: раскрыть протокол → добавить услугу с `orderIndex`, `durationMin`, `intervalDays`
- **Деактивация**: кнопка toggle (отключённые протоколы не появляются на странице лечения)
- **Удаление**: soft delete (deletedAt)
- Все изменения пишутся в `audit_logs`

---

## 4. Применение протокола к плану

На странице `/patients/[id]/treatments` под каждым **активным** планом
(статус ≠ `cancelled`, `completed`) отображается `ApplyProtocolForm`:

1. Выбор протокола из списка активных
2. Нажать «Tətbiq et»
3. Для каждого шага протокола создаётся `TreatmentItem` со статусом `planned`,
   ценой из текущего прайса и doctorId текущего врача
4. `totalPrice` плана пересчитывается
5. В `audit_logs` пишется запись `entityType: "protocol_apply"`

Безопасность:
- `clinicId` всегда из сессии
- `protocolId` проверяется через `tenantClient` (принадлежность клинике)
- `patientId` проверяется через `getPatientForUser` (роль + tenant)
- `treatmentPlanId` проверяется как план этого пациента
- `doctorId` для роли `doctor` — всегда свой, для `assistant` — прикреплённый врач

---

## 5. Follow-up Scheduling (`/treatments/[id]/followup`)

На каждой карточке `TreatmentItem` со статусом `planned` или `in_progress`
(без привязанного `appointmentId`) отображается иконка `CalendarPlus` —
ссылка на `/treatments/[id]/followup`.

**Страница follow-up:**
1. Загружает список врачей клиники
2. Вызывает `findAvailableAppointmentSlots` — 14 дней вперёд, 5 слотов, 15-минутные шаги
3. Отображает предложенные слоты (кнопки → автозаполнение формы)
4. После отправки: создаётся `Appointment`, его `id` пишется в `TreatmentItem.appointmentId`
5. Аудит-запись: `entityType: "follow_up_appointment"`

### `findAvailableAppointmentSlots`

```ts
findAvailableAppointmentSlots(
  user: SessionUser,
  doctorId: string,   // проверяется вызывающим кодом
  fromDate: Date,
  durationMin: number,
  opts?: { searchDays?: number; maxSlots?: number }
): Promise<SlotSuggestion[]>
```

- Берёт рабочие часы из `Setting.working_hours` (fallback: Mo–Fr 09:00–18:00 по умолчанию)
- Загружает все активные приёмы врача в окне поиска (один DB-запрос)
- Шаг сетки — 15 минут; пропускает прошедшее время текущего дня
- Возвращает `{ date, time, endsAt }[]`

---

## 6. Demo-данные (seed)

| Протокол | Шаги |
|----------|------|
| Sadə dolğu | Kariyes müalicəsi (30 дəq) → Kompozit plomba (45 dəq, 0 gün) |
| Kanal müalicəsi protokolu | Konsultasiya (30 dəq) → Kanal müalicəsi (90 dəq, 1 gün) → Kompozit plomba (45 dəq, 7 gün) |
| Profilaktik müayinə | Konsultasiya (20 dəq) → Profilaktik təmizlik (60 dəq, 0 gün) |

---

## 7. E2E

```powershell
npx tsx scripts/e2e-treatment-protocols-check.ts
```

31 проверок: seed, страница протоколов, создание, видимость, применение к плану,
безопасность (fake ID), follow-up scheduling (создание appointment, linkage,
audit_log, slot suggestions, 404 на несуществующий item).
