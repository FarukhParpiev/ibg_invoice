# IBG Invoice

Веб-приложение для генерации инвойсов по комиссионным выплатам между нашими компаниями и контрагентами.

Подробная документация:

- [ТЗ](docs/ТЗ_Invoice_App.md) — функциональные и нефункциональные требования
- [Архитектура](docs/Архитектура.md) — серверная архитектура, БД, 24/7 availability
- [Наши компании](docs/Наши_компании.md) — реестр компаний-плательщиков

## Стек

- **Next.js 16** (App Router, Server Actions)
- **TypeScript**, **Tailwind CSS 4**
- **Prisma 7** + **PostgreSQL** (Neon через Vercel Marketplace)
- **Auth.js v5** (e-mail + пароль, магик-ссылка)
- **Zod**, **React Hook Form** — формы и валидация
- **Vercel Blob** — хранение PDF
- **Vercel KV / Upstash Redis** — кеш и очереди
- **Puppeteer + @sparticuz/chromium** — генерация PDF (серверлесс-совместимая)

## Установка (локально)

```bash
# 1. Клонировать
git clone https://github.com/FarukhParpiev/ibg_invoice.git
cd ibg_invoice

# 2. Установить зависимости
npm install

# 3. Заполнить .env
cp .env.example .env
# → открыть .env и прописать реальные значения

# 4. Применить схему к БД
npm run db:push      # для первого запуска, без миграций
# или
npm run db:migrate   # для продакшена с версионированием

# 5. Заполнить справочники (наши 9 компаний + super-admin)
npm run db:seed

# 6. Запустить dev-сервер
npm run dev
# → http://localhost:3000
```

## Скрипты

| Команда | Описание |
|---|---|
| `npm run dev` | Dev-сервер на :3000 |
| `npm run build` | Production-сборка |
| `npm start` | Production-сервер |
| `npm run lint` | ESLint |
| `npm run typecheck` | Проверка типов TypeScript |
| `npm run db:generate` | Сгенерировать Prisma Client |
| `npm run db:migrate` | Создать и применить миграцию |
| `npm run db:push` | Синхронизировать схему без миграций (dev) |
| `npm run db:seed` | Засеять справочники |
| `npm run db:studio` | Prisma Studio (UI для БД) |

## Структура проекта

```
/
├── docs/                           # ТЗ, Архитектура, Реестр компаний
├── prisma/
│   ├── schema.prisma               # Модель данных (см. §5.1 ТЗ)
│   ├── seed.ts                     # Инициализация БД
│   └── seed/
│       └── companies.ts            # Реестр наших 9 компаний
├── src/
│   ├── app/
│   │   ├── page.tsx                # Главная (публичная)
│   │   ├── login/                  # Страница входа
│   │   ├── admin/                  # Админка (справочники, инвойсы) — TBD
│   │   └── api/
│   │       └── auth/[...nextauth]/ # Auth.js роуты
│   ├── auth.ts                     # Конфиг Auth.js v5
│   └── lib/
│       └── prisma.ts               # Singleton Prisma-клиент
├── .env.example                    # Пример переменных окружения
└── package.json
```

## Деплой на Vercel

1. Пуш в `main` ветку → автодеплой.
2. В Vercel Dashboard → **Storage** → подключить:
   - **Neon Postgres** → `DATABASE_URL`, `DATABASE_URL_UNPOOLED`
   - **Upstash Redis** → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - **Blob** → `BLOB_READ_WRITE_TOKEN`
3. Добавить остальные env-переменные из `.env.example` в настройках проекта.
4. После первого деплоя — применить схему и сид:
   ```bash
   npm i -g vercel
   vercel env pull .env.production.local
   npm run db:push
   npm run db:seed
   ```

## Роли

| Роль | Права |
|---|---|
| `super_admin` | Все действия: справочники, пользователи, редактирование issued-инвойсов, отмена, массовый экспорт, аудит |
| `user` | Создание/редактирование своих draft, просмотр своих инвойсов. Справочники — только чтение |

Первый super-admin создаётся seed-скриптом из переменных `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.

## Ссылки

- Репозиторий: https://github.com/FarukhParpiev/ibg_invoice
- Vercel: _добавить после первого деплоя_
- Продакшен URL: _добавить_
