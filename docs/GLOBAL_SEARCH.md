# Global Search v1 (сессия 16)

Глобальный поиск в topbar — клиентский инпут с debounce, серверный route
handler `/api/search`, бизнес-логика в `lib/search.ts`.

## Архитектура

- **UI**: `components/layout/GlobalSearch.tsx` (client component) — инпут в
  Topbar, debounce 300 мс, dropdown с группами результатов, состояния
  loading/empty/min-length, click-outside закрывает dropdown, Enter →
  переход к первому результату, Escape → закрыть.
- **API**: `GET /api/search?q=...` (`app/api/search/route.ts`) —
  `getCurrentUser()` → 401 без сессии; `Cache-Control: private, no-store`.
- **Бизнес-логика**: `globalSearch(user, rawQuery)` в `lib/search.ts`.

## Поисковые сущности

| Группа | Источник | Поиск по | Лимит | Ссылка |
|---|---|---|---|---|
| Pasiyentlər | `patientScopeWhere` | имя/фамилия, телефон (`normalizePhone`) | 8 | `/patients/{id}` |
| Qəbullar | `appointmentScopeWhere` | имя пациента, имя врача | 8 | `/appointments?view=day&date=YYYY-MM-DD` |
| Hesablar | `patientScopeWhere` (через `patient`) | имя пациента, номер счёта (`INV-NNNNNN`) | 8 | `/finance/invoices/{id}` |
| Sənədlər | `patientScopeWhere` (через `patient`) | заголовок (uploads), имя пациента, тип (AZ-метка) | 8 (pdf+uploads вместе) | `/documents/{id}` (PDF) или `/patients/{id}/documents` (uploads) |
| Xidmətlər | — (без scope, только tenant) | название, категория | 8 | `/settings/services` |

Документы: `pdf_records` (все) + `documents` (только `deletedAt: null`),
объединяются и сортируются по `createdAt desc`, обрезаются до 8.

## Permissions

Каждая группа выполняется только если у пользователя есть `*.view`:
`patients.view`, `appointments.view`, `finance.view`, `documents.view`,
`settings.view` (для услуг). Если права нет — группа **молча пустая**
(`[]`), без признаков наличия данных.

## Минимальная длина / лимиты

- `SEARCH_MIN_LENGTH = 2` — запрос короче (после `trim()`) → пустой
  результат по всем группам (без обращения к БД, без утечки).
- По 8 результатов на группу (`TYPE_LIMIT`), без общего пагинатора.

## Tenant / scope

- Все запросы через `tenantClient(user.clinicId)`.
- Пациенты/счета/документы — `patientScopeWhere` (doctor видит своих
  пациентов и т.п., как в остальных модулях).
- Приёмы — `appointmentScopeWhere`.
- Без `user.clinicId` (например, `super_admin`) — пустой результат.

## Известные ограничения / будущее

- Нет полнотекстового/fuzzy-поиска — только `contains` (case-insensitive).
- У пациентов нет идентификатора (FIN) в схеме — поиск только по имени и
  телефону.
- Приёмы без отдельной страницы — ссылка ведёт на дневной вид календаря.
- Поиск по услугам не учитывает `category.view`/отдельного permission —
  завязан на `settings.view`.
- Нет client-side кэширования/отмены устаревших запросов (race при быстром
  наборе теоретически возможен — debounce 300 мс снижает риск).
