/**
 * Проверка, что T-SQL-движок не пострадал при переносе в src/engine/tsql.js.
 *
 * Сравнивает четыре блока движка (helpers/parsing/translate/validation,
 * evalExpr/rowsMsg/runStatement, listObjects/columns, SAMPLE) с оригиналом
 * из legacy/sql-trainer.html. Любое расхождение — ошибка сборки.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const root = process.cwd()
const legacyPath = join(root, 'legacy', 'sql-trainer.html')

if (!existsSync(legacyPath)) {
  console.warn('[verify-engine] legacy/sql-trainer.html не найден — проверка пропущена.')
  process.exit(0)
}

const legacy = readFileSync(legacyPath, 'utf8')
const engine = readFileSync(join(root, 'src', 'engine', 'tsql.js'), 'utf8')

const script = legacy.match(/<script>\n([\s\S]*?)\n<\/script>/)[1]

function between(src, a, b) {
  const i = src.indexOf(a)
  const j = src.indexOf(b, i)
  if (i < 0 || j < 0) throw new Error(`якорь не найден: ${a} … ${b}`)
  return src.slice(i, j)
}

const i = script.indexOf('const SAMPLE = `')
const j = script.indexOf('`;', i) + 2

const blocks = [
  ['helpers / parsing / T-SQL→SQLite / validation',
    between(script, 'function TErr(num, msg)', '/* ===================== выполнение ===================== */')],
  ['evalExpr / rowsMsg / runStatement',
    between(script, 'function evalExpr(expr)', 'function execute() {')],
  ['listObjects / columns',
    between(script, 'function listObjects(d)', 'function renderTree()')],
  ['SAMPLE', script.slice(i, j)],
]

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
let failed = false

for (const [name, block] of blocks) {
  const present = engine.includes(block.replace(/\n+$/, ''))
  if (!present) failed = true
  console.log(
    `${present ? 'OK  ' : 'FAIL'}  ${name.padEnd(42)} sha=${sha(block)}  ${block.length} симв.`,
  )
}

console.log('')
if (failed) {
  console.error('Движок изменён — это запрещено. Восстановите блоки из legacy/sql-trainer.html.')
  process.exit(1)
}
console.log('Движок совпадает с оригиналом побайтово.')
