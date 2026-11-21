/**
 * Готовит public/ перед сборкой:
 *  1) копирует движок sql.js (js + wasm) — чтобы тренажёр работал без CDN;
 *  2) копирует CNAME в public/ — GitHub Pages читает домен из корня сайта,
 *     а при деплое через Actions публикуется dist/, а не корень репозитория.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const sqlSrc = join(root, 'node_modules', 'sql.js', 'dist')
const sqlDst = join(root, 'public', 'vendor', 'sql')

mkdirSync(sqlDst, { recursive: true })

for (const file of ['sql-wasm.js', 'sql-wasm.wasm']) {
  const from = join(sqlSrc, file)
  if (!existsSync(from)) {
    console.error(`[prepare-public] не найден ${from} — выполни npm install`)
    process.exit(1)
  }
  copyFileSync(from, join(sqlDst, file))
}
console.log('[prepare-public] движок sql.js → public/vendor/sql')

const cname = join(root, 'CNAME')
if (existsSync(cname)) {
  copyFileSync(cname, join(root, 'public', 'CNAME'))
  console.log('[prepare-public] CNAME → public/CNAME')
}
