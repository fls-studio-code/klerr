# Klerr

Сайт домена [klerr.dev](https://klerr.dev) — лендинг и тренажёр T-SQL-запросов.

Собран на **Vue 3 + Vite**, деплоится через **GitHub Actions** на **GitHub Pages**.

| Маршрут | Что открывает |
|---|---|
| `/` | Лендинг: логотип, кнопка SQL-Trainer, блок Roblox-игр |
| `/sql-trainer` | Тренажёр: редактор с подсветкой, Object Explorer, примеры к урокам 1–4, синтаксис SQL Server поверх SQLite |
| `/sql-trainer.html` | Старый адрес — редиректится на `/sql-trainer` |

---

## Требования

- Node.js `^20.19.0` или `>=22.12.0` (Vite 8)
- npm 10+

## Установка

```bash
npm install
```

> **macOS, если npm ругается на TLS** (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`):
> системные корневые сертификаты лежат в отдельном ключе, а Node о них не знает.
> Один раз выгрузите их и укажите в переменной окружения:
>
> ```bash
> security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/macos-roots.pem
> export NODE_EXTRA_CA_CERTS=/tmp/macos-roots.pem
> npm install
> ```
>
> Файл в `/tmp` переживёт перезагрузку, поэтому после рестарта машины команду нужно повторить.

## Команды

```bash
npm run dev            # локальный сервер разработки (Vite)
npm run build          # prepare-public → vite build → postbuild
npm run preview        # предпросмотр собранного dist/ на :4173
npm test               # прогон всех примеров уроков через движок
```

`npm run build` делает три вещи:

1. `scripts/prepare-public.mjs` — копирует движок **sql.js** (`sql-wasm.js` + `sql-wasm.wasm`) в `public/vendor/sql`, чтобы тренажёр работал **без CDN**, и копирует `CNAME` в `public/CNAME` (Pages читает домен из корня сайта, а публикуется `dist/`).
2. `vite build` — собирает приложение в `dist/`.
3. `scripts/postbuild.mjs` — кладёт `dist/index.html` в `dist/404.html` (SPA-фолбэк для чистых URL) и в `dist/sql-trainer/index.html` (чтобы `/sql-trainer` отдавался со статусом 200, а не через 404).

## Деплой

Push в ветку `main` запускает `.github/workflows/deploy.yml`:
checkout → Node 22 → `npm ci` → `npm test` → `npm run build` → upload-pages-artifact → deploy-pages.

**Один раз вручную** нужно переключить источник Pages:

`Settings` → `Pages` → `Build and deployment` → `Source` → **GitHub Actions**

Пока этого не сделано, на klerr.dev отдаётся старая статичная версия, а workflow `dynamic/pages/pages-build-deployment` (legacy) может конфликтовать с новым. После переключения он перестанет срабатывать.

## Структура

```
src/
  engine/tsql.js       движок: базы в localStorage, разбор на пакеты/операторы, базовая трансляция T-SQL → SQLite
  engine/dialect.js    прослойка SQL Server → SQLite (см. ниже)
  engine/tsqlfuncs.js  функции SQL Server: DATEADD, DATEDIFF, CAST/CONVERT, LIKE '[A-C]%', проверка типов
  engine/schema.js     разбор CREATE TABLE для ALTER COLUMN / ADD / DROP CONSTRAINT
  engine/sqlutil.js    утилиты разбора SQL-текста
  engine/sqljs.js      локальная загрузка sql.js
  editor/highlight.js  подсветка T-SQL в редакторе
  lessons.js           примеры к урокам 1–4 для меню «Примеры»
  views/               LandingView.vue, TrainerView.vue
  components/          SqlEditor, ObjectExplorer, LessonMenu, ResultsTable, SnippetBar, TrainerToolbar, …
  styles/              base.css, landing.css, trainer.css
scripts/               prepare-public, postbuild, test-lessons
```

### Прослойка SQL Server → SQLite

Курс построен на SQL Server и SSMS, а в браузере работает SQLite. `dialect.js` закрывает разницу:

- схемы и составные имена: `CREATE SCHEMA`, `Person.Person`, `[dbo].[T]`, `[DB].[dbo].[T]`;
- `CREATE TABLE`: `IDENTITY` в любом месте, `PRIMARY KEY` ⇒ `NOT NULL`, регистронезависимые строки (как collation `*_CI_AS`), проверка внешних ключей (ошибки 1767/1776);
- проверка типов при `INSERT`/`UPDATE`: `VARCHAR(n)` (2628), `TINYINT`/`SMALLINT`/`INT` (220/8115/245), `DECIMAL(p,s)` с округлением, `DATE`/`DATETIME`/`SMALLDATETIME` с диапазонами (241/242);
- `ALTER TABLE`: `ALTER COLUMN`, `ADD/DROP CONSTRAINT` (PK, UNIQUE, FK, CHECK, `DEFAULT … FOR`), несколько колонок сразу; `DROP TABLE`/`TRUNCATE` с проверкой внешних ключей;
- `IF … BEGIN … END ELSE`, `DB_ID`, `OBJECT_ID`, `EXEC sp_rename`, `sp_help`, `SET NOCOUNT`, `SET IDENTITY_INSERT`, `TOP … PERCENT`;
- сообщения об ошибках с номерами SQL Server, номером строки и подсказкой на русском (например, `LIMIT` → «используй TOP»).

`npm test` выполняет каждый пример из `lessons.js` дважды и сверяет номера ошибок с теми, что пример показывает намеренно.
