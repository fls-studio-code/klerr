/**
 * Значения мини-Python и всё, что с ними делается: вывод (str/repr/format),
 * равенство, сравнение, преобразование из/в обычный JS (для моделей).
 *
 * Соответствие типов:
 *   None → null, bool → boolean, int/float → number, str → string,
 *   list → Array, tuple → Array с меткой, dict → Map, функции → JS-функции (args, kwargs).
 * Ограничение: JS не различает 2 и 2.0, поэтому целые float печатаются как целые.
 */
import { PyError } from './errors.js'

/** Объект со своими атрибутами: модуль, токенизатор, исключение. */
export class PyObj {
  constructor(type, attrs = {}, str = null) {
    this.type = type
    this.attrs = attrs
    this.str = str
  }
}

const TUPLE = Symbol('tuple')
export function mkTuple(arr) {
  Object.defineProperty(arr, TUPLE, { value: true })
  return arr
}
export const isTuple = v => Array.isArray(v) && v[TUPLE] === true

export function typeName(v) {
  if (v === null || v === undefined) return 'NoneType'
  switch (typeof v) {
    case 'boolean': return 'bool'
    case 'number': return Number.isInteger(v) ? 'int' : 'float'
    case 'string': return 'str'
    case 'function': return v.pyKind || 'function'
    default:
  }
  if (Array.isArray(v)) return isTuple(v) ? 'tuple' : 'list'
  if (v instanceof Map) return 'dict'
  if (v instanceof PyObj) return v.type
  return 'object'
}

export function truthy(v) {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  if (v instanceof Map) return v.size > 0
  return true
}

/* ---------- числа и строки ---------- */
export function numStr(v) {
  if (Number.isNaN(v)) return 'nan'
  if (v === Infinity) return 'inf'
  if (v === -Infinity) return '-inf'
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return String(v)
  const a = Math.abs(v)
  if (a !== 0 && (a < 1e-4 || a >= 1e16)) return fixExp(v.toExponential())
  return String(v)
}

function fixExp(s) {
  // 1e-5 → 1e-05, как в Python
  return s.replace(/e([+-])(\d)$/, 'e$10$2')
}

export function reprStr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'"
  let out = q
  for (const ch of s) {
    if (ch === '\\') out += '\\\\'
    else if (ch === q) out += '\\' + q
    else if (ch === '\n') out += '\\n'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\r') out += '\\r'
    else out += ch
  }
  return out + q
}

export function pyRepr(v, seen = new Set()) {
  if (v === null || v === undefined) return 'None'
  switch (typeof v) {
    case 'boolean': return v ? 'True' : 'False'
    case 'number': return numStr(v)
    case 'string': return reprStr(v)
    case 'function': return v.pyRepr || `<function ${v.pyName || 'anonymous'}>`
    default:
  }
  if (Array.isArray(v)) {
    if (seen.has(v)) return isTuple(v) ? '(...)' : '[...]'
    seen.add(v)
    const inner = v.map(x => pyRepr(x, seen)).join(', ')
    seen.delete(v)
    if (isTuple(v)) return v.length === 1 ? `(${inner},)` : `(${inner})`
    return `[${inner}]`
  }
  if (v instanceof Map) {
    if (seen.has(v)) return '{...}'
    seen.add(v)
    const inner = [...v].map(([k, x]) => `${pyRepr(k, seen)}: ${pyRepr(x, seen)}`).join(', ')
    seen.delete(v)
    return `{${inner}}`
  }
  if (v instanceof PyObj) return v.str ? v.str() : `<${v.type} object>`
  return String(v)
}

export function pyStr(v) {
  return typeof v === 'string' ? v : pyRepr(v)
}

/**
 * x.toFixed(p) с округлением как в Python: ровно посередине (2.25 → 2.2) выбирается
 * чётная цифра. JS в таких случаях округляет вверх. Значения вроде 2.675 (на деле
 * чуть меньше середины) оба языка округляют одинаково.
 */
export function pyFixed(x, p) {
  const fixed = x.toFixed(p)
  if (!Number.isFinite(x) || p > 60) return fixed
  const exact = Math.abs(x).toFixed(Math.min(p + 30, 100))
  const dot = exact.indexOf('.')
  if (!/^50*$/.test(exact.slice(dot + 1 + p))) return fixed
  const kept = exact.slice(0, dot + 1 + p).replace(/\.$/, '')
  const lastDigit = Number(kept[kept.length - 1])
  if (lastDigit % 2 !== 0) return fixed
  return (x < 0 ? '-' : '') + kept
}

/* ---------- форматирование {x:.2f} ---------- */
const SPEC = /^(?:([\s\S])?([<>^=]))?([+\- ])?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/

function groupDigits(intPart, sep) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

export function formatValue(v, spec) {
  if (!spec) return pyStr(v)
  const m = SPEC.exec(spec)
  if (!m) {
    throw new PyError('ValueError', `Invalid format specifier '${spec}'`, null,
      'Примеры формата: {x:.2f} (2 знака после точки), {x:>10} (ширина 10), {x:,} (разделитель тысяч).')
  }
  let [, fill, align, sign, zero, width, group, prec, type] = m
  const isNum = typeof v === 'number' || typeof v === 'boolean'
  let body

  if (type && 'feEgGd%xXob'.includes(type)) {
    if (!isNum) throw new PyError('ValueError', `Unknown format code '${type}' for object of type '${typeName(v)}'`, null, 'Числовой формат (f, d, e, %) подходит только числам.')
    let x = Number(v)
    const neg = x < 0 || Object.is(x, -0)
    if (neg) x = -x
    const p = prec === undefined ? undefined : Number(prec)
    switch (type) {
      case 'f': case 'F': body = pyFixed(x, p ?? 6); break
      case 'e': case 'E': body = fixExp(x.toExponential(p ?? 6)); break
      case 'g': case 'G': body = p === undefined ? numStr(x) : String(Number(x.toPrecision(p || 1))); break
      case '%': body = pyFixed(x * 100, p ?? 6) + '%'; break
      case 'd': body = String(Math.trunc(x)); break
      case 'x': body = Math.trunc(x).toString(16); break
      case 'X': body = Math.trunc(x).toString(16).toUpperCase(); break
      case 'o': body = Math.trunc(x).toString(8); break
      case 'b': body = Math.trunc(x).toString(2); break
      default: body = numStr(x)
    }
    if (group) {
      const [ip, ...rest] = body.split('.')
      body = [groupDigits(ip, group === '_' ? '_' : ','), ...rest].join('.')
    }
    const signStr = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : ''
    if (zero && !align) { fill = '0'; align = '=' }
    return pad(signStr, body, width, fill, align || '>')
  }

  if (type && type !== 's') {
    throw new PyError('ValueError', `Unknown format code '${type}' for object of type '${typeName(v)}'`, null, 'Для текста подходит формат s (или без типа).')
  }
  let s = isNum && !type ? numStr(Number(v)) : pyStr(v)
  if (typeof v === 'string' && prec !== undefined) s = [...s].slice(0, Number(prec)).join('')
  if (isNum && !type) {
    if (group) { const [ip, ...rest] = s.split('.'); s = [groupDigits(ip.replace('-', ''), group === '_' ? '_' : ','), ...rest].join('.') }
    const neg = s.startsWith('-')
    const signStr = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : ''
    if (zero && !align) { fill = '0'; align = '=' }
    return pad(signStr, neg ? s.slice(1) : s, width, fill, align || '>')
  }
  return pad('', s, width, fill, align || '<')
}

function pad(sign, body, width, fill = ' ', align = '>') {
  const w = width ? Number(width) : 0
  const len = [...(sign + body)].length
  if (len >= w) return sign + body
  const gap = w - len
  switch (align) {
    case '<': return sign + body + fill.repeat(gap)
    case '^': { const l = Math.floor(gap / 2); return fill.repeat(l) + sign + body + fill.repeat(gap - l) }
    case '=': return sign + fill.repeat(gap) + body
    default: return fill.repeat(gap) + sign + body
  }
}

/* ---------- равенство и сравнение ---------- */
export function deepEq(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
    return false
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length || isTuple(a) !== isTuple(b)) return false
    return a.every((x, i) => deepEq(x, b[i]))
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !deepEq(v, b.get(k))) return false
    return true
  }
  return false
}

/** -1 / 0 / 1; бросает TypeError для несравнимых типов */
export function compare(a, b, opName = '<') {
  const na = typeof a === 'boolean' ? Number(a) : a
  const nb = typeof b === 'boolean' ? Number(b) : b
  if ((typeof na === 'number' && typeof nb === 'number') || (typeof na === 'string' && typeof nb === 'string')) {
    return na < nb ? -1 : na > nb ? 1 : 0
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i++) {
      if (!deepEq(a[i], b[i])) return compare(a[i], b[i], opName)
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0
  }
  throw new PyError('TypeError', `'${opName}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`, null,
    'Сравнивать можно числа с числами и строки со строками. Приведи типы: int(...), str(...).')
}

/* ---------- JS ⇄ Python ---------- */
export function fromJS(v) {
  if (v === undefined || v === null) return null
  if (Array.isArray(v)) return v.map(fromJS)
  if (ArrayBuffer.isView(v)) return Array.from(v, fromJS)
  if (typeof v === 'object') {
    if (v instanceof Map || v instanceof PyObj) return v
    return new Map(Object.entries(v).map(([k, x]) => [k, fromJS(x)]))
  }
  return v
}

export function toJS(v) {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(toJS)
  if (v instanceof Map) {
    const o = {}
    for (const [k, x] of v) o[String(k)] = toJS(x)
    return o
  }
  if (typeof v === 'function' || v instanceof PyObj) return undefined
  return v
}

/* ---------- JSON в стиле Python ---------- */
export function jsonDumps(v, indent = null, ensureAscii = true, level = 0) {
  const nl = indent === null ? '' : '\n' + ' '.repeat(indent * (level + 1))
  const nlEnd = indent === null ? '' : '\n' + ' '.repeat(indent * level)
  const sepItem = indent === null ? ', ' : ','
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? numStr(v) : (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity')
  if (typeof v === 'string') {
    let s = JSON.stringify(v)
    if (ensureAscii) s = s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    return s
  }
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return '[' + nl + v.map(x => jsonDumps(x, indent, ensureAscii, level + 1)).join(sepItem + nl) + nlEnd + ']'
  }
  if (v instanceof Map) {
    if (!v.size) return '{}'
    const parts = [...v].map(([k, x]) => jsonDumps(String(k), indent, ensureAscii) + ': ' + jsonDumps(x, indent, ensureAscii, level + 1))
    return '{' + nl + parts.join(sepItem + nl) + nlEnd + '}'
  }
  throw new PyError('TypeError', `Object of type ${typeName(v)} is not JSON serializable`)
}

/* ---------- подсказка «возможно, вы имели в виду…» ---------- */
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

export function suggest(name, candidates) {
  let best = null
  let bestD = Infinity
  const lname = name.toLowerCase()
  for (const c of candidates) {
    const d = lev(lname, c.toLowerCase())
    if (d < bestD) { bestD = d; best = c }
  }
  const limit = name.length <= 3 ? 1 : 2
  return bestD <= limit ? best : null
}
