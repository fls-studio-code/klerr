# Klerr

Сайт домена [klerr.dev](https://klerr.dev) — лендинг и тренажёр T-SQL-запросов.

Собран на **Vue 3 + Vite**, деплоится через **GitHub Actions** на **GitHub Pages**.

| Маршрут | Что открывает |
|---|---|
| `/` | Лендинг: логотип, кнопка SQL-Trainer, блок Roblox-игр |
| `/sql-trainer` | Тренажёр: редактор, Object Explorer, трансляция T-SQL → SQLite |
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
npm run verify:engine  # контроль: T-SQL-движок не изменился
```

`npm run build` делает три вещи:

1. `scripts/prepare-public.mjs` — копирует движок **sql.js** (`sql-wasm.js` + `sql-wasm.wasm`) в `public/vendor/sql`, чтобы тренажёр работал **без CDN**, и копирует `CNAME` в `public/CNAME` (Pages читает домен из корня сайта, а публикуется `dist/`).
2. `vite build` — собирает приложение в `dist/`.
3. `scripts/postbuild.mjs` — кладёт `dist/index.html` в `dist/404.html` (SPA-фолбэк для чистых URL) и в `dist/sql-trainer/index.html` (чтобы `/sql-trainer` отдавался со статусом 200, а не через 404).

## Деплой

Push в ветку `main` запускает `.github/workflows/deploy.yml`:
checkout → Node 22 → `npm ci` → `npm run verify:engine` → `npm run build` → upload-pages-artifact → deploy-pages.

**Один раз вручную** нужно переключить источник Pages:

`Settings` → `Pages` → `Build and deployment` → `Source` → **GitHub Actions**

Пока этого не сделано, на klerr.dev отдаётся старая статичная версия, а workflow `dynamic/pages/pages-build-deployment` (legacy) может конфликтовать с новым. После переключения он перестанет срабатывать.

## Структура

```
src/
  engine/tsql.js      движок T-SQL → SQLite (извлечён из legacy без изменений)
  engine/sqljs.js     локальная загрузка sql.js
  lessons.js          уроки-примеры для выпадающего меню «Примеры»
  views/              LandingView.vue, TrainerView.vue
  components/         KlerrMark, GameCard, TrainerToolbar, LessonMenu, ObjectExplorer, SnippetBar, ResultsTable
  styles/             base.css, landing.css, trainer.css
scripts/              prepare-public, postbuild, verify-engine
legacy/               исходные статичные index.html и sql-trainer.html
```

### Контроль движка

`src/engine/tsql.js` содержит трансляцию T-SQL → SQLite, валидацию с номерами ошибок SSMS и выборку данных. Этот код **перенесён побайтово** из `legacy/sql-trainer.html` — переписана только оркестровка (DOM → чистые данные).

`npm run verify:engine` сверяет четыре блока движка с `legacy/sql-trainer.html` по SHA-256 и роняет сборку при любом расхождении. Шаг запускается и в CI — изменить логику трансляции, не обновив эталон, не получится.

Если `legacy/sql-trainer.html` удалён, проверка печатает предупреждение и завершается с кодом 0 (в CI эталон лежит в репозитории, так что там она всегда выполняется).
