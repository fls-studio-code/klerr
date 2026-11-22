# Klerr

Сайт домена [klerr.dev](https://klerr.dev) — лендинг, тренажёр T-SQL-запросов и лаборатория Transformers.

Собран на **Vue 3 + Vite**, деплоится через **GitHub Actions** на **GitHub Pages**.

| Маршрут | Что открывает |
|---|---|
| `/` | Лендинг: логотип, кнопка SQL-Trainer, блок Roblox-игр |
| `/sql-trainer` | Тренажёр: редактор с подсветкой, Object Explorer, примеры к урокам 1–4, синтаксис SQL Server поверх SQLite |
| `/transformers-lab` | Лаборатория к уроку 11 курса Data Science: интерпретатор мини-Python, демо-модели и настоящие модели в браузере |
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
npm test               # примеры SQL-уроков через движок + интерпретатор и примеры лаборатории
```

`npm run build` делает три вещи:

1. `scripts/prepare-public.mjs` — копирует движок **sql.js** (`sql-wasm.js` + `sql-wasm.wasm`) в `public/vendor/sql`, чтобы тренажёр работал **без CDN**, и копирует `CNAME` в `public/CNAME` (Pages читает домен из корня сайта, а публикуется `dist/`).
2. `vite build` — собирает приложение в `dist/`.
3. `scripts/postbuild.mjs` — кладёт `dist/index.html` в `dist/404.html` (SPA-фолбэк для чистых URL) и в `dist/sql-trainer/index.html`, `dist/transformers-lab/index.html` (чтобы эти адреса отдавались со статусом 200, а не через 404).

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
  engine/pylite/       интерпретатор мини-Python (лексер, парсер, вычислитель, встроенные функции)
  engine/ml/           модели лаборатории: демо (demo.js), каталог (catalog.js), мост к Transformers.js (real.js + real.worker.js)
  lab/examples.js      примеры к уроку 11 для меню «Примеры» лаборатории
  views/               LandingView.vue, TrainerView.vue, LabView.vue
  components/          SqlEditor (общий редактор), ObjectExplorer, LessonMenu, ResultsTable, SnippetBar, TrainerToolbar, ModelPanel, LabHelp, …
  composables/         useSplit.js: разделитель редактора и результатов
  styles/              base.css, landing.css, trainer.css, lab.css
scripts/               prepare-public, postbuild, test-lessons, test-lab
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

## Лаборатория Transformers (`/transformers-lab`)

Страница к уроку 11 курса Data Science. Студент пишет код на **мини-Python** (как в `CODE.txt` урока: `pipeline`, `set_seed`, `AutoTokenizer`), нажимает Run и получает вывод, ошибки в стиле Traceback с подсказками на русском и подсветкой строки.

**Интерпретатор** (`src/engine/pylite/`) написан на JS без зависимостей и работает в браузере. Поддержаны переменные, списки, словари, кортежи, f-строки, `if/for/while`, `def/lambda`, генераторы списков, `try/except`, `import` модулей `transformers`, `math`, `random`, `json`, `time`. Не поддержаны классы, `with`, `yield`, множества, файлы, `input()` и сторонние библиотеки. Число `2.0` печатается как `2` (JS не различает int и float).

**Два режима моделей** (переключатель в тулбаре):

| Режим | Что запускается | Сеть |
|---|---|---|
| Демо | игрушечные аналоги: словарь оценок слов, цепь Маркова, выбор предложений, приближённая токенизация | не нужна |
| Реальные модели | DistilBERT, GPT‑2, DistilBART, OPUS‑MT через [Transformers.js](https://github.com/huggingface/transformers.js) в Web Worker | huggingface.co и cdn.jsdelivr.net при первой загрузке |

Скачанные модели хранятся в кэше браузера (Cache Storage `transformers-cache`). Панель «Модели» показывает, что уже скачано, умеет скачать заранее и удалить из кэша. Python-имена из кода сопоставляются с ONNX-версиями (`gpt2` → `Xenova/gpt2`, `facebook/bart-large-cnn` → уменьшенная `Xenova/distilbart-cnn-6-6`), см. `src/engine/ml/catalog.js`.

Заметки по сборке:

- Transformers.js загружается лениво (отдельный чанк и воркер), лендинг и SQL-тренажёр его не тянут.
- ONNX Runtime ссылается на свой 27 МБ `.wasm`. `vite.config.js` убирает его из сборки: движок берётся с jsDelivr, как и по умолчанию в Transformers.js.
- В Transformers.js 4 для GPT‑подобных моделей ищется файл `model_quantized.onnx`, а в `Xenova/gpt2` он лежит как `decoder_model_merged_quantized.onnx`. Поэтому для GPT‑2 в каталоге задан `loadOptions.model_file_name`.
- Размеры моделей в каталоге: DistilBERT ≈ 69 МБ, GPT‑2 ≈ 130 МБ, DistilBART ≈ 285 МБ, OPUS‑MT ≈ 108 МБ.
