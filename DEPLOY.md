# Деплой STAND GRADE

Проект — это Express-сервер, который раздаёт собранный React-фронтенд из `dist/`
и хранит состояние в JSON-файле. Поэтому рекомендуемая площадка — **Render**
(нужен постоянный процесс и файловое хранилище).

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `PORT` | выдаёт хостинг | Порт HTTP-сервера (локально по умолчанию `3001`). |
| `SESSION_SECRET` | да, на проде | Секрет подписи токенов. Длинная случайная строка. |
| `DATA_DIR` | желательно | Папка для `store.json` и `session.secret` (на Render — `/var/data`). |
| `DATABASE_URL` | для сохранения данных | Postgres для хранения аккаунтов между деплоями. Без него используется JSON-файл. |
| `PLAYER_PASSWORD` | нет | Пароль `player` при первом создании базы (по умолчанию `player`). |
| `OWNER_PASSWORD` | нет | Пароль владельца `owner` при первом создании базы (по умолчанию `owner12`). |
| `OWNER_START_BALANCE` | нет | Стартовый баланс владельца (по умолчанию `500000`). |
| `ENABLE_ADMIN_ACCOUNT` | нет | `true` возвращает скрытого `admin` (по умолчанию выключен, аккаунт удалён). |

Аккаунт `owner` нужен для вкладки «Промокоды»: только владелец и администратор
могут создавать коды. Игроки активируют их и получают голду один раз на аккаунт.

Сгенерировать секрет:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Render (рекомендуется)

1. Залей репозиторий на GitHub/GitLab и создай **Web Service** из него.
   Если есть `render.yaml`, Render подхватит настройки автоматически (**New → Blueprint**).
2. Вручную настройки сервиса:
   - **Runtime:** Node
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. Environment → добавь `SESSION_SECRET` (Generate), `DATABASE_URL`
   (см. раздел «Сохранение данных»), при желании `PLAYER_PASSWORD` и `OWNER_PASSWORD`.
4. Deploy. Приложение будет доступно по адресу `https://<service>.onrender.com`.

### Сохранение данных между деплоями

На бесплатном Render файловая система эфемерная: `store.json` сбрасывается
при каждом деплое и рестарте. Чтобы балансы, инвентарь и промокоды сохранялись,
подключите внешний Postgres.

#### Supabase

1. Создай проект на [supabase.com](https://supabase.com) (регион ближе к Render,
   например `us-east-1`). Пароль базы сохрани в менеджере паролей.
2. Открой **Project Settings → Database → Connection string → URI** и выбери
   **Session pooler** (порт `5432`). Прямое подключение (`db.<ref>.supabase.co`)
   использует IPv6 и с Render может не работать.
3. Скопируй строку вида
   `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   и подставь пароль базы. Спецсимволы в пароле закодируй URL-encoding
   (`@` → `%40`, `#` → `%23`, `:` → `%3A`).
4. Render → сервис `stand-grade` → **Environment → Edit** → у `DATABASE_URL`
   замени значение на строку из Supabase → **Save, rebuild, and deploy**.
5. Проверь `https://stand-grade.onrender.com/api/health` — должно быть
   `"persistence":"postgres"`.

Секрет хранится только в Render Environment, в Git его не коммить.
Локально его можно положить в `.env` (файл в `.gitignore`):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

#### Перенос текущих аккаунтов из старой базы

Если нужно сохранить текущие балансы, инвентарь и промокоды, сначала перенеси
состояние из Render Postgres в Supabase. В Render открой базу → **Connect →
External Database URL** — это `SOURCE_DATABASE_URL`. Строка Supabase — это
`TARGET_DATABASE_URL`.

Создай `.env` в корне проекта:

```bash
SOURCE_DATABASE_URL=postgresql://...render...
TARGET_DATABASE_URL=postgresql://...supabase...
```

И выполни:

```bash
npm run db:copy
```

Скрипт читает таблицу `stand_grade_state` из старой базы и перезаписывает её
в новой. После этого можно указывать Supabase в `DATABASE_URL` на Render.

Если переносить нечего, просто подключи пустую Supabase: при первом старте
сервер сам создаст таблицу `stand_grade_state` и аккаунты `player` и `owner`
с балансами по умолчанию. Скрытый `admin` по умолчанию удалён; вернуть его
можно переменной `ENABLE_ADMIN_ACCOUNT=true`.

При старте сервер загружает состояние из БД и сохраняет каждое изменение.
`/api/health` покажет `"persistence":"postgres"` — значит, данные переживут
следующий деплой. Первый запуск с пустой БД возьмёт локальный `data/store.json`,
если он есть, иначе создаст аккаунты заново.

Импорт локального `data/store.json` в пустую базу:

```bash
DATABASE_URL=postgresql://... npm run db:import
```

На Windows PowerShell переменную удобнее задать так:

```powershell
$env:DATABASE_URL="postgresql://..."
npm run db:import
```

Важно про бесплатный Supabase: проект **засыпает после 7 дней без запросов**.
Пока он спит, приложение не сможет подключиться к базе — проект нужно разбудить
вручную в дашборде Supabase. Для демо это нормально, для постоянной работы
лучше платный план.

Альтернатива для платного Render: подключить **Disk** с mount path `/var/data`
и задать `DATA_DIR=/var/data` — тогда достаточно JSON-файла.

## Vercel

Vercel плохо подходит для этого проекта: он рассчитан на serverless-функции,
а здесь долгоживущий Express-сервер с записью состояния в файл. ФС на Vercel
только для чтения (кроме `/tmp`, который не сохраняется между вызовами),
поэтому `store.json` будет теряться, а разные инстансы — расходиться.

Если всё же нужен Vercel, придётся:
- вынести состояние в внешнюю БД (Postgres/Upstash/Redis);
- обернуть Express в `api/index.js` с `export default app` и rewrite `/(.*)`;
- убрать `app.listen` для serverless-окружения.

Для демо-прототипа проще и надёжнее Render.

## Каталог Standoff 2

Реальные скины, цены, редкости и изображения берутся из публичного API
StandoffCraft и сохраняются в `server-data/standoffcraft.js`. Приложению не нужен
доступ к API во время работы: используется снимок данных.

Обновить каталог и кейсы:

```bash
npm run sync:standoffcraft
```

Скрипт скачивает `/api/skins` и собирает расширенный каталог: все оружейные
скины, а также дорогие стикеры, брелоки, агенты, кейсы и другие предметы.
Снимок сохраняется в `server-data/standoffcraft.js` (сейчас 1 498 предметов, без агентов).
Кейсы — собственные, тематические STAND GRADE; они описаны в `server.js`.
Изображения подключаются по публичным URL `skin.standoffcraft.com`; при
недоступности картинки интерфейс откатывается на локальную SVG-графику.

## Локальная проверка перед деплоем

```bash
npm ci
npm run build
PORT=3001 NODE_ENV=production SESSION_SECRET=<hex> npm start
# открой http://localhost:3001 и проверь /api/health
```
