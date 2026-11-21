/**
 * Klerr — разбор и сборка CREATE TABLE в том виде, как его хранит SQLite.
 *
 * Нужен прослойке, чтобы делать то, чего SQLite не умеет «на месте»:
 * ALTER COLUMN, ADD/DROP CONSTRAINT (PRIMARY KEY, UNIQUE, FOREIGN KEY, DEFAULT),
 * sp_rename для ограничений — через пересборку таблицы, как SQL Server.
 */
import { mask, matchParen, splitTopText, unq, qi } from './sqlutil.js'

export const HIDDEN = 'klerr$' // служебные CHECK-ограничения проверки типов

/* ---------- токены верхнего уровня ---------- */
function tokens(text) {
  const m = mask(text, true)
  const out = []
  for (let i = 0; i < m.length;) {
    const c = m[i]
    if (/\s/.test(c)) { i++; continue }
    let j
    if (c === '(') { j = matchParen(m, i); j = j < 0 ? m.length : j + 1 }
    else if (c === "'") { j = m.indexOf("'", i + 1); j = j < 0 ? m.length : j + 1 }
    else if (c === '[' || c === '"' || c === '`') { const cl = c === '[' ? ']' : c; j = m.indexOf(cl, i + 1); j = j < 0 ? m.length : j + 1 }
    else if (/[\w$#@]/.test(c)) { j = i; while (j < m.length && /[\w$#@]/.test(m[j])) j++ }
    else j = i + 1
    const t = text.slice(i, j)
    out.push({ t, p: i, e: j, w: /^[A-Za-z_]\w*$/.test(t) ? t.toUpperCase() : '' })
    i = j
  }
  return out
}

const COL_START = ['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'DEFAULT', 'COLLATE', 'REFERENCES', 'GENERATED']

/** Колонка: { kind:'col', name, type, segs:[{name, body, kind}] } */
export function parseColDef(text) {
  const tk = tokens(text)
  if (!tk.length) return null
  const name = unq(tk[0].t)
  const starts = []
  let skip = 0, named = false
  for (let k = 1; k < tk.length; k++) {
    const { w } = tk[k]
    if (skip) {
      // знак числа в DEFAULT -1 относится к значению
      if ((tk[k].t === '-' || tk[k].t === '+') && k + 1 < tk.length) { k++ }
      skip--
      continue
    }
    const prev = tk[k - 1].w, next = tk[k + 1] ? tk[k + 1].w : ''
    const isStart = COL_START.includes(w) ||
      (w === 'NOT' && next !== 'DEFERRABLE') ||
      (w === 'NULL' && prev !== 'NOT' && prev !== 'SET' && prev !== 'DEFAULT')
    if (!isStart) continue
    if (named) named = false
    else starts.push(k)
    if (w === 'CONSTRAINT') { skip = 1; named = true }
    else if (w === 'DEFAULT' || w === 'COLLATE') skip = 1
  }
  const typeEnd = starts.length ? tk[starts[0]].p : text.length
  const type = text.slice(tk[0].e, typeEnd).trim()
  const segs = starts.map((k, idx) => {
    const a = tk[k].p
    const b = idx + 1 < starts.length ? tk[starts[idx + 1]].p : text.length
    return parseSeg(text.slice(a, b).trim())
  })
  return { kind: 'col', name, type, segs }
}

function parseSeg(t) {
  let name = null, body = t
  const tk = tokens(t)
  if (tk[0] && tk[0].w === 'CONSTRAINT' && tk[1]) {
    name = unq(tk[1].t)
    body = t.slice(tk[2] ? tk[2].p : t.length).trim()
  }
  const w = (body.match(/^\w+/) || [''])[0].toUpperCase()
  const kind = { PRIMARY: 'pk', NOT: 'notnull', NULL: 'null', UNIQUE: 'unique', CHECK: 'check', DEFAULT: 'default', COLLATE: 'collate', REFERENCES: 'fk', GENERATED: 'generated', FOREIGN: 'fk' }[w] || 'other'
  return { name, body, kind }
}

const firstParen = s => {
  const m = mask(s, true)
  const i = m.indexOf('(')
  if (i < 0) return null
  const j = matchParen(m, i)
  return j < 0 ? null : { inner: s.slice(i + 1, j), end: j + 1 }
}

const colList = s => splitTopText(s).map(x => unq(x.trim().replace(/\s+(ASC|DESC)$/i, ''))).filter(Boolean)

/** Ограничение уровня таблицы. */
function parseTableDef(text) {
  const seg = parseSeg(text)
  const out = { kind: 'tbl', name: seg.name, body: seg.body, ckind: seg.kind, cols: [], refTable: null, refCols: [] }
  if (seg.kind === 'pk' || seg.kind === 'unique') {
    const p = firstParen(seg.body)
    if (p) out.cols = colList(p.inner)
  } else if (seg.kind === 'fk') {
    const p = firstParen(seg.body)
    if (p) {
      out.cols = colList(p.inner)
      const rest = seg.body.slice(p.end)
      const rm = rest.match(/^\s*REFERENCES\s+("(?:[^"]|"")*"|\[[^\]]+\]|`[^`]+`|[\w$#@.]+)\s*(\(([^)]*)\))?/i)
      if (rm) { out.refTable = unq(rm[1]); out.refCols = rm[3] ? colList(rm[3]) : [] }
    }
  }
  return out
}

/** Полный разбор CREATE TABLE. */
export function parseCreate(sql) {
  const m = mask(sql, true)
  const open = m.indexOf('(')
  const close = matchParen(m, open)
  if (open < 0 || close < 0) return null
  const head = sql.slice(0, open)
  const nm = head.match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+?)\s*$/i)
  const name = nm ? unq(nm[1]) : ''
  const defs = splitTopText(sql.slice(open + 1, close))
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(t) ? parseTableDef(t) : parseColDef(t)))
    .filter(Boolean)
  return { name, defs, tail: sql.slice(close + 1) }
}

export function renderSeg(s) {
  return (s.name ? 'CONSTRAINT ' + qi(s.name) + ' ' : '') + s.body
}

export function renderCol(c) {
  return [qi(c.name), c.type, ...c.segs.map(renderSeg)].filter(Boolean).join(' ')
}

export function renderCreate(p, name = p.name) {
  const defs = p.defs.map(d => (d.kind === 'col' ? renderCol(d) : renderSeg(d)))
  return `CREATE TABLE ${qi(name)} (\n  ${defs.join(',\n  ')}\n)${p.tail || ''}`
}

/* ---------- сведения о ключах ---------- */

const isAutoinc = c => c.segs.some(s => s.kind === 'pk' && /AUTOINCREMENT/i.test(s.body))

export const colsOf = p => p.defs.filter(d => d.kind === 'col')
export const findCol = (p, n) => colsOf(p).find(c => c.name.toLowerCase() === String(n).toLowerCase())
export const isIdentity = c => !!c && isAutoinc(c)

/** Скрытая проверка типа колонки: { base, a, b } или null. */
export function hiddenInfo(c) {
  const s = c.segs.find(x => x.name && x.name.startsWith(HIDDEN))
  if (!s) return null
  const m = s.body.match(/KLERR_T\(\s*"(?:[^"]|"")*"\s*,\s*'(\w+)'\s*,\s*(NULL|-?\d+)\s*,\s*(NULL|-?\d+)/i)
  if (!m) return null
  return { base: m[1], a: m[2].toUpperCase() === 'NULL' ? null : +m[2], b: m[3].toUpperCase() === 'NULL' ? null : +m[3] }
}

/**
 * Список ограничений таблицы в терминах SQL Server.
 * [{ name, kind:'pk'|'unique'|'fk'|'check'|'default', cols, refTable, refCols, col, def, seg, auto }]
 */
export function constraintsOf(p) {
  const tbl = p.name.split('.').pop()
  const out = []
  for (const d of p.defs) {
    if (d.kind === 'col') {
      for (const s of d.segs) {
        if (s.name && s.name.startsWith(HIDDEN)) continue
        if (!['pk', 'unique', 'fk', 'check', 'default'].includes(s.kind)) continue
        const item = { name: s.name, kind: s.kind, cols: [d.name], col: d.name, def: d, seg: s, refTable: null, refCols: [] }
        if (s.kind === 'fk') {
          const rm = s.body.match(/^REFERENCES\s+("(?:[^"]|"")*"|\[[^\]]+\]|`[^`]+`|[\w$#@.]+)\s*(\(([^)]*)\))?/i)
          if (rm) { item.refTable = unq(rm[1]); item.refCols = rm[3] ? colList(rm[3]) : [] }
        }
        out.push(item)
      }
    } else if (['pk', 'unique', 'fk', 'check'].includes(d.ckind)) {
      out.push({ name: d.name, kind: d.ckind, cols: d.cols, col: null, def: d, seg: null, refTable: d.refTable, refCols: d.refCols })
    }
  }
  const prefix = { pk: 'PK', unique: 'UQ', fk: 'FK', check: 'CK', default: 'DF' }
  out.forEach((c, i) => {
    if (!c.name) {
      c.auto = true
      const extra = c.kind === 'fk' ? (c.refTable || '').split('.').pop() : c.cols.join('_') || String(i)
      c.name = c.kind === 'pk' ? `PK__${tbl}` : `${prefix[c.kind]}__${tbl}__${extra}`
    }
  })
  return out
}

export const pkCols = p => {
  const pk = constraintsOf(p).find(c => c.kind === 'pk')
  return pk ? pk.cols : []
}
