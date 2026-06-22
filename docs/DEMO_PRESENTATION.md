# Dental Pro CRM — Demo Presentation Script

**by AV Systems** · создано в сессии 52 (Demo / Public Presentation Polish v1)

Этот документ — сценарий показа продукта **клинике** (owner/həkim/assistent),
в отличие от [DEMO.md](DEMO.md) (разработческая шпаргалка: команды, e2e,
известные ограничения). Для деплоя публичного demo-инстанса — см.
[FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md).

---

## 1. Demo URL

```
<DEMO_URL_PLACEHOLDER>.vercel.app
```

Заполнить после деплоя (см. FREE_DEMO_DEPLOY.md §6). Если показ идёт
локально — `http://localhost:3000`.

## 2. Demo-логины

| Email / alias | Şifrə | Rol |
|---|---|---|
| `admin@demo.dentalpro.az` (alias `admin`) | `admin123` | Klinika sahibi (owner) — əsas demo hesabı |
| `hekim@demo.dentalpro.az` | `admin123` | Həkim (doctor) |
| `assistent@demo.dentalpro.az` | `admin123` | Assistent |

> Парол выше — для **публичного demo-деплоя** (`SEED_DEMO_PASSWORD=admin123`,
> см. FREE_DEMO_DEPLOY.md). Если показываете с локальной dev-машины
> (`npm run dev`), пароль может быть другим — см. [SETUP.md](SETUP.md) §6
> (`Demo1234!` для long-running локальной БД). Перед демо просто попробуйте
> залогиниться один раз заранее, чтобы не гадать на ходу.

Если `NEXT_PUBLIC_DEMO_MODE=true`, на странице входа есть подсказка
«Demo giriş / admin / admin123» — её можно показать клиенту прямо на экране
входа, не озвучивая пароль голосом.

## 3. Рекомендованный демо-путь (10 шагов)

1. **Login** — `admin@demo.dentalpro.az`. Если показывали подсказку на
   экране входа — обратить внимание, что данные не нужно запоминать.
2. **Dashboard** — сегодняшние приёмы, открытые счета, low-stock материалы,
   панель «Qəbul xatırlatmaları» (кандидаты на напоминание).
3. **Pasiyent kartı** — открыть **Rəşad Həsənov** (Global Search в topbar
   или `/patients`): телефон, аллергии, история.
4. **Qəbul** — создать новый приём любому пациенту на удобное время
   (`/appointments`).
5. **Müalicə / Diş xəritəsi** — FDI-зубная карта с заполненными статусами
   (16/36/11/46), добавить процедуру пациенту.
6. **Maliyyə** — открыть счёт Rəşad'а (частичная оплата 100/170 AZN),
   показать **долг** и кнопку напоминания об оплате (`/finance/debts`).
7. **Əlaqə tarixçəsi** — на карточке пациента показать лог коммуникаций +
   WhatsApp click-to-chat кнопку (готовый текст + `wa.me`-ссылка).
8. **Recall / Pasiyent rəyləri** — `/recalls` (kontrol xatırlatmaları),
   `/feedback` (rəylər). Если demo-данные пустые на момент показа — см. §5,
   подготовить пример прямо на демо (1 клик, 10 секунд).
9. **Anbar / Təchizatçılar** — `/inventory` (low-stock материалы),
   `/inventory/suppliers` (каталог Demo Dental Təchizat).
10. **Admin / Ayarlar** — `/admin` (кадры, роли), `/settings` (реквизиты,
    рабочие часы, прайс услуг).

## 4. Что говорить каждой роли

**Klinika sahibi (owner / decision maker):**
- Видит всё: финансы, склад, кадры, отчёты по расходникам.
- Подчеркнуть: tenant-изоляция (другая клиника не видит ваши данные),
  роли/права настраиваются под сотрудника, audit log на ключевые действия.
- Показать долговую очередь (`/finance/debts`) и low-stock alerts — это
  то, что owner реально проверяет каждый день.

**Həkim (doctor):**
- Видит своих пациентов (если `doctor_sees_all_patients=false`), зубную
  карту, treatment plans, протоколы лечения (`/settings/protocols` →
  применить к плану).
- Нет доступа к Maliyyə-управлению и Admin/Ayarlar (manage) — показать
  разницу в доступе при перелогине.

**Assistent / reception:**
- Qəbullar (расписание), Pasiyentlər (регистрация), Əlaqə (напоминания
  о приёме через WhatsApp click-to-chat).
- Нет доступа к Maliyyə, Anbar (manage), Admin, Ayarlar (manage).

## 5. Если Recall/Feedback/Əlaqə выглядят пустыми

Свежий seed не создаёт примеров для `RecallTask`, `PatientFeedback` и лога
коммуникаций (см. §6) — это намеренно (см. Session 52 architecture note:
избегали изменений `prisma/seed.ts`, чтобы не задеть count-based проверки
в ~40 e2e-наборах). На живом демо это **легко закрыть за 1 клик**:

- **Əlaqə tarixçəsi**: на карточке пациента → «Pasiyentə zəng et / mesaj
  yaz» → ручная запись коммуникации, либо кнопка WhatsApp-напоминания на
  dashboard-панели «Qəbul xatırlatmaları».
- **Recall**: завершить процедуру → `/treatments/[id]/recall` → создать
  задачу контроля.
- **Feedback**: завершённый приём/процедура → подготовить ссылку отзыва
  (кнопка на карточке пациента) → опционально открыть `/r/<token>` в
  другой вкладке как «пациент» и отправить рейтинг 5★, чтобы показать,
  как выглядит готовый отзыв в `/feedback`.

Это даже выигрывает у статичных данных — клиника видит **реальный
рабочий процесс**, а не декорацию.

## 6. Текущее покрытие demo-данных (seed.ts, сессия 52 — без изменений)

- Клиника: Demo Klinika, 4 пациента (1 ребёнок через himayəçi), 3 приёма
  (2 сегодня + 1 завершённый вчера), зубная карта Rəşad'а (4 записи).
- Maliyyə: 1 счёт (170 AZN, оплачено 100, долг 70 — статус `partial`).
- Anbar: 6 материалов (2 в статусе low-stock), 1 поставщик + 4 позиции
  каталога, 2 supplier order (sent/received).
- Protocols: 3 протокола лечения (Sadə dolğu, Kanal müalicəsi, Profilaktik
  müayinə).
- **Пусто на свежем seed** (намеренно, см. §5): `RecallTask`,
  `PatientFeedback`, лог коммуникаций (`Notification` channel
  whatsapp/sms/phone/other). Demo-данные по этим модулям накапливаются по
  ходу использования системы (или готовятся вживую на демо).

## 7. Что НЕ обещать клиенту (пока)

- **WhatsApp Business API** — нет, только manual click-to-chat (`wa.me`,
  сотрудник сам нажимает «отправить»). Нет авто-отправки/доставки/статусов.
- **Payment gateway** — нет онлайн-оплаты, только ручная фиксация платежа
  сотрудником.
- **Полный patient portal** — у пациента нет логина/личного кабинета;
  есть только одноразовые токенизированные ссылки (`/r/<token>`) для
  конкретного действия (подтвердить приём, оставить отзыв и т.д.).
- **PDF user manual со скриншотами** — финальная фаза проекта, не входит
  ни в эту, ни в текущие сессии.
- Email/push-уведомления — только in-app.
- Автоматический планировщик напоминаний (cron) — окно напоминаний
  считается (`reminder_hours_before`), но отправка/подготовка всегда по
  ручному клику сотрудника.

## 8. См. также

- [DEMO.md](DEMO.md) — команды разработчика, известные ограничения,
  старый 10-минутный демо-путь (сессия 18).
- [FREE_DEMO_DEPLOY.md](FREE_DEMO_DEPLOY.md) — деплой публичного demo на
  Vercel + Neon.
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — статус модулей, e2e-итоги.
