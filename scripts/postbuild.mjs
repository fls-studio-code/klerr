/**
 * GitHub Pages отдаёт 404.html для любого неизвестного пути.
 *
 * 1) Копируем собранный index.html в 404.html — тогда SPA-роутер загружается
 *    по любому адресу и сам решает, какую страницу показать.
 * 2) Дополнительно кладём index.html в dist/sql-trainer/index.html — тогда
 *    адрес /sql-trainer отдаётся как настоящий файл со статусом 200,
 *    а не через 404. Пути в ассетах абсолютные (/assets/...), поэтому
 *    копия работает из подкаталога без правок.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(process.cwd(), 'dist')
const index = join(dist, 'index.html')
const notFound = join(dist, '404.html')

if (!existsSync(index)) {
  console.error('[postbuild] не найден dist/index.html — сборка не удалась?')
  process.exit(1)
}

copyFileSync(index, notFound)
console.log('[postbuild] dist/404.html создан (SPA-фолбэк для чистых URL)')

const trainerDir = join(dist, 'sql-trainer')
mkdirSync(trainerDir, { recursive: true })
copyFileSync(index, join(trainerDir, 'index.html'))
console.log('[postbuild] dist/sql-trainer/index.html создан (200 вместо 404)')
