/**
 * GitHub Pages отдаёт 404.html для любого неизвестного пути.
 *
 * 1) Копируем собранный index.html в 404.html — тогда SPA-роутер загружается
 *    по любому адресу и сам решает, какую страницу показать.
 * 2) Дополнительно кладём index.html в dist/<маршрут>/index.html — тогда
 *    адреса /sql-trainer и /transformers-lab отдаются как настоящие файлы
 *    со статусом 200, а не через 404. Пути в ассетах абсолютные (/assets/...), поэтому
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

for (const route of ['sql-trainer', 'transformers-lab']) {
  const dir = join(dist, route)
  mkdirSync(dir, { recursive: true })
  copyFileSync(index, join(dir, 'index.html'))
  console.log(`[postbuild] dist/${route}/index.html создан (200 вместо 404)`)
}
