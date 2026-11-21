/**
 * Прогон всех примеров из меню «Примеры» через движок и прослойку.
 *
 * Каждый пример выполняется дважды подряд (примеры должны быть повторяемыми).
 * Ошибки допускаются только те, что пример показывает намеренно (EXPECTED).
 * Запуск: npm test
 */
import { createRequire } from 'node:module'
import { createEngine } from '../src/engine/tsql.js'
import { LESSONS, WELCOME } from '../src/lessons.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

// Номера ошибок SQL Server, которые пример вызывает специально.
const EXPECTED = {
  'l1-task': [2627],
  'l1-types': [220, 2628, 8115, 241, 242, 242],
  'l2-pk': [2627, 515],
  'l2-composite': [2627],
  'l2-fk': [547, 547],
  'l2-relations': [2627],
  'l3-null-alter': [515],
  'l3-constraints': [2627, 547],
}

const engine = createEngine({ locateFile: f => require.resolve('sql.js/dist/' + f) })
await engine.init(initSqlJs)

let failed = 0
const errNums = r => r.log.filter(l => l.t === 'err').map(l => +l.m.match(/^Msg (\d+)/)[1])

function check(id, sql, expected = []) {
  const r = engine.execute(sql)
  const got = errNums(r)
  const ok = got.length === expected.length && got.every((n, i) => n === expected[i])
  if (!ok) {
    failed++
    console.log(`FAIL  ${id}: ожидались ошибки [${expected}], получены [${got}]`)
    for (const l of r.log.filter(x => x.t === 'err')) console.log('      ' + l.m.replace(/\n/g, ' | '))
  } else {
    console.log(`ok    ${id}`)
  }
  return r
}

check('welcome', WELCOME)
for (const pass of [1, 2]) {
  for (const l of LESSONS) for (const it of l.items) check(`${it.id} (#${pass})`, it.sql, EXPECTED[it.id])
}

// Выборочная проверка результатов, а не только отсутствия ошибок
function value(sql) {
  const r = engine.execute(sql)
  const s = r.sets[r.sets.length - 1]
  return s ? s.rows[0][0] : undefined
}
const spot = [
  ["SELECT COUNT(*) FROM Students WHERE FirstName LIKE '[A-C]%'", 3],
  ["SELECT COUNT(*) FROM Students WHERE FirstName LIKE '[^AB]%'", 2],
  ["SELECT COUNT(*) FROM Students WHERE LastName = 'SMITH'", 1],
  ["SELECT DATEADD(DAY, 5, '2025-08-01')", '2025-08-06 00:00:00.000'],
  ["SELECT DATEDIFF(DAY, RentalDate, ReturnDate) FROM CarRentalss WHERE RentalID = 1", 10],
  ["SELECT DATEDIFF(MONTH, '2025-01-31', '2025-02-01')", 1],
  ["SELECT CAST('2025/07/18' AS DATE)", '2025-07-18'],
  ["SELECT LEN('abc  ')", 3],
]
engine.execute('USE SchoolDB')
for (const [sql, want] of spot) {
  const got = value(sql)
  if (got !== want) { failed++; console.log(`FAIL  ${sql}\n      ожидалось ${JSON.stringify(want)}, получено ${JSON.stringify(got)}`) }
  else console.log(`ok    ${sql}`)
}

console.log(failed ? `\n${failed} проверок не прошло.` : '\nВсе примеры и проверки прошли.')
process.exit(failed ? 1 : 0)
