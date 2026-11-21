/**
 * Klerr — встроенные функции SQL Server, которых нет в SQLite.
 *
 * Регистрируются в каждой базе sql.js через attachFunctions(db).
 * Работают так, как их описывает документация SQL Server:
 * DATEADD/DATEDIFF считают границы, LIKE понимает [A-C] и [^A],
 * CAST в даты проверяет формат и диапазоны (DATETIME — с 1753 года,
 * SMALLDATETIME — 1900-01-01…2079-06-06) и т. д.
 *
 * Ошибки выбрасываются строкой «KLERR|<номер>|<текст>» — прослойка
 * (dialect.js) превращает её в сообщение в стиле SSMS.
 */

export const kerr = (num, msg) => new Error(`KLERR|${num}|${msg}`)

/* ===================== типы ===================== */

export const STRING_TYPES = ['char', 'varchar', 'nchar', 'nvarchar']
export const INT_RANGE = {
  tinyint: [0, 255],
  smallint: [-32768, 32767],
  int: [-2147483648, 2147483647],
  integer: [-2147483648, 2147483647],
  bigint: [-9223372036854775808, 9223372036854775807],
}
export const DATE_TYPES = ['date', 'datetime', 'datetime2', 'smalldatetime', 'time', 'datetimeoffset']
const FLOAT_TYPES = ['float', 'real', 'money', 'smallmoney']
const DEC_TYPES = ['decimal', 'numeric', 'dec']

/** «VARCHAR(50)» → { base:'varchar', a:50, b:null, max:false } */
export function parseType(t) {
  const m = String(t || '').trim().match(/^(\w+)\s*(?:\(\s*(max|\d+)\s*(?:,\s*(\d+)\s*)?\))?$/i)
  if (!m) return null
  const max = /^max$/i.test(m[2] || '')
  return {
    base: m[1].toLowerCase(),
    a: m[2] !== undefined && !max ? +m[2] : null,
    b: m[3] !== undefined ? +m[3] : null,
    max,
    hasArgs: m[2] !== undefined,
  }
}

/* ===================== даты ===================== */

const pad = (n, w = 2) => String(n).padStart(w, '0')
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysIn = (y, m) => (m === 2 && leap(y) ? 29 : DIM[m - 1])

const TIME_RE = '(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,7}))?)?\\s*([AaPp][Mm])?'

/**
 * Разбор строки даты так, как это делает SQL Server с языком us_english.
 * Возвращает {y,m,d,hh,mi,ss,frac,hasDate,hasTime} или null.
 */
export function parseDT(v) {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m, y, mo, d, t = null
  if ((m = s.match(new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:(?:\\s+|T)${TIME_RE})?$`)))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]]; t = m.slice(4)
  } else if ((m = s.match(new RegExp(`^(\\d{4})(\\d{2})(\\d{2})(?:\\s+${TIME_RE})?$`)))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]]; t = m.slice(4)
  } else if ((m = s.match(new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})(?:\\s+${TIME_RE})?$`)))) {
    // us_english: месяц/день/год
    [mo, d, y] = [+m[1], +m[2], +m[3]]; t = m.slice(4)
  } else if ((m = s.match(new RegExp(`^${TIME_RE}$`)))) {
    [y, mo, d] = [1900, 1, 1]; t = m.slice(1)
    return finish(y, mo, d, t, false)
  } else return null
  return finish(y, mo, d, t, true)
}

function finish(y, mo, d, t, hasDate) {
  if (y < 1 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null
  let hh = 0, mi = 0, ss = 0, frac = ''
  const hasTime = !!(t && t[0] !== undefined)
  if (hasTime) {
    hh = +t[0]; mi = +t[1]; ss = t[2] !== undefined ? +t[2] : 0; frac = t[3] || ''
    const ap = t[4] ? t[4].toUpperCase() : null
    if (ap) { if (hh < 1 || hh > 12) return null; if (ap === 'PM' && hh < 12) hh += 12; if (ap === 'AM' && hh === 12) hh = 0 }
    if (hh > 23 || mi > 59 || ss > 59) return null
  }
  return { y, m: mo, d, hh, mi, ss, frac, hasDate, hasTime }
}

const msOf = p => Math.round(+('0.' + (p.frac || '0')) * 1000)

function toDate(p) {
  const dt = new Date(Date.UTC(2000, 0, 1, p.hh, p.mi, p.ss, msOf(p)))
  dt.setUTCFullYear(p.y, p.m - 1, p.d)
  return dt
}
function fromDate(dt, frac) {
  return {
    y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    hh: dt.getUTCHours(), mi: dt.getUTCMinutes(), ss: dt.getUTCSeconds(),
    frac: frac !== undefined ? frac : pad(dt.getUTCMilliseconds(), 3), hasDate: true, hasTime: true,
  }
}

const fmtDate = p => `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`
const fmtTime = (p, digits) => {
  const base = `${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}`
  if (!digits) return base
  return base + '.' + (p.frac || '').padEnd(digits, '0').slice(0, digits)
}

/** Канонический вид значения для типа (как его показывает SSMS). */
export function formatDT(p, base, scale) {
  switch (base) {
    case 'date': return fmtDate(p)
    case 'time': return fmtTime(p, scale === null || scale === undefined ? 7 : scale)
    case 'smalldatetime': return `${fmtDate(p)} ${pad(p.hh)}:${pad(p.mi)}:00`
    case 'datetime2':
    case 'datetimeoffset': return `${fmtDate(p)} ${fmtTime(p, scale === null || scale === undefined ? 7 : scale)}`
    default: return `${fmtDate(p)} ${fmtTime(p, 3)}`
  }
}

function roundSmall(p) {
  // SMALLDATETIME округляет до минуты: 29.998 с и меньше — вниз, больше — вверх
  const dt = toDate({ ...p, frac: '' , ss: 0 })
  if (p.ss + msOf(p) / 1000 >= 29.999) dt.setUTCMinutes(dt.getUTCMinutes() + 1)
  return fromDate(dt, '')
}

/** Проверка и приведение значения к типу даты. Бросает ошибки SQL Server. */
export function convertDT(v, base, scale, src = 'varchar') {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') throw kerr(206, `Operand type clash: ${Number.isInteger(v) ? 'int' : 'numeric'} is incompatible with ${base}`)
  let p = parseDT(String(v))
  if (!p) throw kerr(241, 'Conversion failed when converting date and/or time from character string.')
  if (base === 'smalldatetime') {
    p = roundSmall(p)
    const key = fmtDate(p) + ' ' + pad(p.hh) + pad(p.mi)
    if (key < '1900-01-01 0000' || key > '2079-06-06 2359') {
      throw kerr(242, `The conversion of a ${src} data type to a smalldatetime data type resulted in an out-of-range value.`)
    }
  } else if (base === 'datetime' && p.y < 1753) {
    throw kerr(242, `The conversion of a ${src} data type to a datetime data type resulted in an out-of-range value.`)
  }
  return formatDT(p, base, scale)
}

const PARTS = {
  year: 'year', yy: 'year', yyyy: 'year',
  quarter: 'quarter', qq: 'quarter', q: 'quarter',
  month: 'month', mm: 'month', m: 'month',
  dayofyear: 'dayofyear', dy: 'dayofyear', y: 'dayofyear',
  day: 'day', dd: 'day', d: 'day',
  week: 'week', wk: 'week', ww: 'week',
  weekday: 'weekday', dw: 'weekday', w: 'weekday',
  hour: 'hour', hh: 'hour',
  minute: 'minute', mi: 'minute', n: 'minute',
  second: 'second', ss: 'second', s: 'second',
  millisecond: 'millisecond', ms: 'millisecond',
  iso_week: 'iso_week', isowk: 'iso_week', isoww: 'iso_week',
}
export const normPart = s => PARTS[String(s).toLowerCase()] || null

function needDate(v, fn) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') throw kerr(206, `Operand type clash: int is incompatible with date`)
  const p = parseDT(String(v))
  if (!p) throw kerr(241, 'Conversion failed when converting date and/or time from character string.')
  return p
}

const DAY_MS = 86400000
const EPOCH = Date.UTC(1900, 0, 1)
const dayNo = dt => Math.floor((dt.getTime() - EPOCH) / DAY_MS)

function dateAdd(part, n, v, literal) {
  const p0 = needDate(v)
  if (!p0 || n === null || n === undefined) return null
  const P = normPart(part)
  if (!P) throw kerr(155, `'${part}' is not a recognized dateadd option.`)
  n = Math.trunc(Number(n))
  const dt = toDate(p0)
  const addMonths = k => {
    const y = p0.y, m = p0.m - 1 + k
    const ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12 + 1
    const nd = Math.min(p0.d, daysIn(ny, nm))
    dt.setUTCFullYear(ny, nm - 1, nd)
  }
  switch (P) {
    case 'year': addMonths(12 * n); break
    case 'quarter': addMonths(3 * n); break
    case 'month': addMonths(n); break
    case 'day': case 'dayofyear': case 'weekday': dt.setUTCDate(dt.getUTCDate() + n); break
    case 'week': case 'iso_week': dt.setUTCDate(dt.getUTCDate() + 7 * n); break
    case 'hour': dt.setUTCHours(dt.getUTCHours() + n); break
    case 'minute': dt.setUTCMinutes(dt.getUTCMinutes() + n); break
    case 'second': dt.setUTCSeconds(dt.getUTCSeconds() + n); break
    case 'millisecond': dt.setUTCMilliseconds(dt.getUTCMilliseconds() + n); break
  }
  if (dt.getUTCFullYear() < 1 || dt.getUTCFullYear() > 9999) throw kerr(517, 'Adding a value to a \'datetime\' column caused an overflow.')
  const out = fromDate(dt)
  const timePart = ['hour', 'minute', 'second', 'millisecond'].includes(P)
  // Строковый литерал SQL Server превращает в DATETIME; колонка DATE остаётся датой.
  if (!literal && !p0.hasTime && !timePart) return fmtDate(out)
  if (!p0.hasDate) return fmtTime(out, 3)
  return `${fmtDate(out)} ${fmtTime(out, 3)}`
}

function dateDiff(part, a, b) {
  const pa = needDate(a), pb = needDate(b)
  if (!pa || !pb) return null
  const P = normPart(part)
  if (!P) throw kerr(155, `'${part}' is not a recognized datediff option.`)
  const da = toDate(pa), db = toDate(pb)
  switch (P) {
    case 'year': return pb.y - pa.y
    case 'quarter': return (pb.y * 4 + Math.floor((pb.m - 1) / 3)) - (pa.y * 4 + Math.floor((pa.m - 1) / 3))
    case 'month': return (pb.y * 12 + pb.m) - (pa.y * 12 + pa.m)
    case 'day': case 'dayofyear': case 'weekday': return dayNo(db) - dayNo(da)
    case 'week': return Math.floor((dayNo(db) + 1) / 7) - Math.floor((dayNo(da) + 1) / 7)
    case 'iso_week': return Math.floor(dayNo(db) / 7) - Math.floor(dayNo(da) / 7)
    case 'hour': return Math.floor(db.getTime() / 3600000) - Math.floor(da.getTime() / 3600000)
    case 'minute': return Math.floor(db.getTime() / 60000) - Math.floor(da.getTime() / 60000)
    case 'second': return Math.floor(db.getTime() / 1000) - Math.floor(da.getTime() / 1000)
    case 'millisecond': return db.getTime() - da.getTime()
  }
  return null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function isoWeek(dt) {
  const d = new Date(dt.getTime())
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d - firstThu) / DAY_MS - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
}

function datePart(part, v) {
  const p = needDate(v)
  if (!p) return null
  const P = normPart(part)
  if (!P) throw kerr(155, `'${part}' is not a recognized datepart option.`)
  const dt = toDate(p)
  const jan1 = new Date(Date.UTC(2000, 0, 1)); jan1.setUTCFullYear(p.y, 0, 1)
  switch (P) {
    case 'year': return p.y
    case 'quarter': return Math.floor((p.m - 1) / 3) + 1
    case 'month': return p.m
    case 'dayofyear': return dayNo(dt) - dayNo(jan1) + 1
    case 'day': return p.d
    case 'week': return Math.floor((dayNo(dt) - dayNo(jan1) + jan1.getUTCDay()) / 7) + 1
    case 'weekday': return dt.getUTCDay() + 1
    case 'hour': return p.hh
    case 'minute': return p.mi
    case 'second': return p.ss
    case 'millisecond': return msOf(p)
    case 'iso_week': return isoWeek(dt)
  }
  return null
}

function dateName(part, v) {
  const p = needDate(v)
  if (!p) return null
  const P = normPart(part)
  if (P === 'month') return MONTHS[p.m - 1]
  if (P === 'weekday') return WDAYS[toDate(p).getUTCDay()]
  const r = datePart(part, v)
  return r === null ? null : String(r)
}

export function nowLocal(utc = false) {
  const t = new Date()
  const f = utc
    ? [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), t.getUTCMilliseconds()]
    : [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()]
  return `${pad(f[0], 4)}-${pad(f[1])}-${pad(f[2])} ${pad(f[3])}:${pad(f[4])}:${pad(f[5])}.${pad(f[6], 3)}`
}

/* ===================== LIKE в стиле T-SQL ===================== */

const likeCache = new Map()

/** '%', '_', '[abc]', '[a-c]', '[^a]' + регистронезависимость (collation CI). */
export function likeToRegex(pat, esc) {
  const key = pat + '\u0000' + (esc || '')
  let re = likeCache.get(key)
  if (re) return re
  let out = '^'
  const special = /[\\^$.*+?()[\]{}|/]/
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]
    if (esc && c === esc && i + 1 < pat.length) {
      const n = pat[++i]
      out += special.test(n) ? '\\' + n : n
    } else if (c === '%') out += '[\\s\\S]*'
    else if (c === '_') out += '[\\s\\S]'
    else if (c === '[') {
      const end = pat.indexOf(']', i + 2)
      if (end < 0) { out += '\\['; continue }
      let body = pat.slice(i + 1, end)
      let neg = false
      if (body[0] === '^') { neg = true; body = body.slice(1) }
      const cls = body.replace(/[\\\]^]/g, m => '\\' + m)
      out += neg ? `[^${cls}]` : `[${cls}]`
      i = end
    } else out += special.test(c) ? '\\' + c : c
  }
  out += '$'
  re = new RegExp(out, 'i')
  if (likeCache.size > 500) likeCache.clear()
  likeCache.set(key, re)
  return re
}

function tsqlLike(pat, val, esc) {
  if (pat === null || val === null || pat === undefined || val === undefined) return null
  return likeToRegex(String(pat), esc ? String(esc) : '').test(String(val)) ? 1 : 0
}

/* ===================== CAST / CONVERT ===================== */

const isNumText = s => /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(s)

function roundTo(v, s) {
  const f = Math.pow(10, s)
  const r = Math.round(Math.abs(v) * f + 1e-9) / f
  return v < 0 ? -r : r
}

/** Приведение типов по правилам SQL Server. typeText — как в исходном CAST. */
export function castValue(v, typeText, style, tryMode) {
  try {
    return castStrict(v, typeText, style)
  } catch (e) {
    if (tryMode) return null
    throw e
  }
}

const srcName = v => (typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'numeric') : 'varchar')

function castStrict(v, typeText, style) {
  const t = parseType(typeText)
  if (!t) throw kerr(243, `Type ${typeText} is not a defined system type.`)
  if (v === null || v === undefined) return null
  const { base } = t
  if (STRING_TYPES.includes(base) || base === 'text' || base === 'ntext') {
    const s = style !== null && style !== undefined && typeof v === 'string' && parseDT(v)
      ? styleDate(parseDT(v), +style)
      : String(v)
    const n = t.max ? null : (t.a !== null ? t.a : 30)
    return n !== null && STRING_TYPES.includes(base) ? s.slice(0, n) : s
  }
  if (INT_RANGE[base] || base === 'bit') {
    let n
    if (typeof v === 'number') n = v
    else if (isNumText(String(v)) && /^\s*[+-]?\d+\s*$/.test(String(v))) n = +v
    else if (base === 'bit' && /^\s*(true|false)\s*$/i.test(String(v))) return /true/i.test(String(v)) ? 1 : 0
    else throw kerr(245, `Conversion failed when converting the varchar value '${v}' to data type ${base}.`)
    if (base === 'bit') return n ? 1 : 0
    n = Math.trunc(n)
    const [lo, hi] = INT_RANGE[base]
    if (n < lo || n > hi) throw kerr(base === 'int' || base === 'integer' || base === 'bigint' ? 8115 : 220,
      base === 'int' || base === 'integer' || base === 'bigint'
        ? `Arithmetic overflow error converting expression to data type ${base}.`
        : `Arithmetic overflow error for data type ${base}, value = ${n}.`)
    return n
  }
  if (DEC_TYPES.includes(base)) {
    let n
    if (typeof v === 'number') n = v
    else if (isNumText(String(v))) n = +v
    else throw kerr(8114, 'Error converting data type varchar to numeric.')
    const p = t.a !== null ? t.a : 18, s = t.b !== null ? t.b : 0
    n = roundTo(n, s)
    if (Math.abs(n) >= Math.pow(10, p - s)) throw kerr(8115, `Arithmetic overflow error converting ${srcName(v)} to data type numeric.`)
    return n
  }
  if (FLOAT_TYPES.includes(base)) {
    if (typeof v === 'number') return base.endsWith('money') ? roundTo(v, 4) : v
    if (isNumText(String(v))) return base.endsWith('money') ? roundTo(+v, 4) : +v
    throw kerr(8114, `Error converting data type varchar to ${base}.`)
  }
  if (DATE_TYPES.includes(base)) return convertDT(v, base, t.a, srcName(v))
  if (base === 'uniqueidentifier' || base === 'xml' || base === 'sql_variant') return String(v)
  if (base === 'binary' || base === 'varbinary') return v
  throw kerr(243, `Type ${typeText} is not a defined system type.`)
}

/** Стили CONVERT для дат. */
function styleDate(p, st) {
  const y4 = pad(p.y, 4), y2 = pad(p.y % 100), M = pad(p.m), D = pad(p.d)
  const T = `${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}`
  switch (st) {
    case 1: return `${M}/${D}/${y2}`
    case 101: return `${M}/${D}/${y4}`
    case 3: return `${D}/${M}/${y2}`
    case 103: return `${D}/${M}/${y4}`
    case 4: return `${D}.${M}.${y2}`
    case 104: return `${D}.${M}.${y4}`
    case 5: return `${D}-${M}-${y2}`
    case 105: return `${D}-${M}-${y4}`
    case 10: return `${M}-${D}-${y2}`
    case 110: return `${M}-${D}-${y4}`
    case 11: return `${y2}/${M}/${D}`
    case 111: return `${y4}/${M}/${D}`
    case 12: return `${y2}${M}${D}`
    case 112: return `${y4}${M}${D}`
    case 8: case 108: case 24: return T
    case 20: case 120: return `${y4}-${M}-${D} ${T}`
    case 21: case 121: case 25: return `${y4}-${M}-${D} ${T}.${pad(msOf(p), 3)}`
    case 23: return `${y4}-${M}-${D}`
    case 126: case 127: return `${y4}-${M}-${D}T${T}.${pad(msOf(p), 3)}`
    default: return formatDT(p, 'datetime')
  }
}

/* ===================== FORMAT (минимально) ===================== */

function formatFn(v, fmt) {
  if (v === null || v === undefined || fmt === null) return null
  const f = String(fmt)
  if (typeof v === 'number' || isNumText(String(v))) {
    const n = Number(v)
    let m
    if ((m = f.match(/^([NnCcPpDdFf])(\d*)$/))) {
      const k = m[1].toUpperCase(), d = m[2] === '' ? (k === 'D' ? 0 : 2) : +m[2]
      if (k === 'D') return String(Math.trunc(n)).padStart(d, '0')
      if (k === 'F') return n.toFixed(d)
      if (k === 'P') return (n * 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %'
      const s = n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
      return k === 'C' ? '$' + s : s
    }
    if (/^[#0,.]+$/.test(f)) {
      const dec = (f.split('.')[1] || '').length
      return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: f.includes(',') })
    }
    return String(n)
  }
  const p = parseDT(String(v))
  if (!p) return null
  const dt = toDate(p)
  const map = {
    yyyy: pad(p.y, 4), yy: pad(p.y % 100), MMMM: MONTHS[p.m - 1], MMM: MONTHS[p.m - 1].slice(0, 3),
    MM: pad(p.m), M: String(p.m), dddd: WDAYS[dt.getUTCDay()], ddd: WDAYS[dt.getUTCDay()].slice(0, 3),
    dd: pad(p.d), d: String(p.d), HH: pad(p.hh), H: String(p.hh),
    hh: pad(((p.hh + 11) % 12) + 1), h: String(((p.hh + 11) % 12) + 1),
    mm: pad(p.mi), m: String(p.mi), ss: pad(p.ss), s: String(p.ss),
    fff: pad(msOf(p), 3), tt: p.hh < 12 ? 'AM' : 'PM',
  }
  return f.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|fff|tt/g, k => map[k])
}

/* ===================== проверка и нормализация колонок ===================== */

/**
 * KLERR_T — проверка значения перед записью в колонку (через CHECK).
 * Бросает ровно те ошибки, что SQL Server при INSERT/UPDATE.
 */
export function checkValue(v, base, a, b, col) {
  if (v === null || v === undefined) return 1
  if (STRING_TYPES.includes(base)) {
    const n = a === null || a === undefined ? null : +a
    const s = String(v)
    if (n !== null && n >= 0 && s.length > n) {
      throw kerr(2628, `String or binary data would be truncated in table '{table}', column '${col}'. Truncated value: '${s.slice(0, n)}'.`)
    }
    return 1
  }
  if (INT_RANGE[base]) {
    if (typeof v === 'string') throw kerr(245, `Conversion failed when converting the varchar value '${v}' to data type ${base}.`)
    if (typeof v === 'number') {
      const [lo, hi] = INT_RANGE[base]
      const n = Math.trunc(v)
      if (n < lo || n > hi) {
        throw base === 'tinyint' || base === 'smallint'
          ? kerr(220, `Arithmetic overflow error for data type ${base}, value = ${n}.`)
          : kerr(8115, `Arithmetic overflow error converting expression to data type ${base}.`)
      }
    }
    return 1
  }
  if (base === 'bit') {
    if (typeof v === 'string' && !/^\s*(true|false)\s*$/i.test(v)) throw kerr(245, `Conversion failed when converting the varchar value '${v}' to data type bit.`)
    return 1
  }
  if (DEC_TYPES.includes(base)) {
    if (typeof v === 'string') throw kerr(8114, 'Error converting data type varchar to numeric.')
    const p = a === null || a === undefined ? 18 : +a, s = b === null || b === undefined ? 0 : +b
    if (typeof v === 'number' && Math.abs(roundTo(v, s)) >= Math.pow(10, p - s)) {
      throw kerr(8115, `Arithmetic overflow error converting ${srcName(v)} to data type numeric.`)
    }
    return 1
  }
  if (FLOAT_TYPES.includes(base)) {
    if (typeof v === 'string') throw kerr(8114, `Error converting data type varchar to ${base}.`)
    return 1
  }
  if (DATE_TYPES.includes(base)) {
    convertDT(v, base, a)
    return 1
  }
  return 1
}

/** KLERR_N — приведение уже записанного значения к виду SQL Server (через триггер). */
export function normValue(v, base, a, b) {
  if (v === null || v === undefined) return v
  try {
    if (INT_RANGE[base]) return typeof v === 'number' ? Math.trunc(v) : v
    if (base === 'bit') {
      if (typeof v === 'number') return v ? 1 : 0
      if (/^\s*true\s*$/i.test(v)) return 1
      if (/^\s*false\s*$/i.test(v)) return 0
      return v
    }
    if (DEC_TYPES.includes(base)) return typeof v === 'number' ? roundTo(v, b === null || b === undefined ? 0 : +b) : v
    if (base === 'money' || base === 'smallmoney') return typeof v === 'number' ? roundTo(v, 4) : v
    if (DATE_TYPES.includes(base)) return convertDT(v, base, a)
  } catch (e) { return v }
  return v
}

export const NORMALIZABLE = base =>
  !!INT_RANGE[base] || base === 'bit' || DEC_TYPES.includes(base) || base === 'money' || base === 'smallmoney' || DATE_TYPES.includes(base)

export const CHECKABLE = base =>
  STRING_TYPES.includes(base) || NORMALIZABLE(base) || FLOAT_TYPES.includes(base)

/* ===================== регистрация ===================== */

const num = v => (v === null || v === undefined ? null : Number(v))
const str = v => (v === null || v === undefined ? null : String(v))

const attached = new WeakSet()

export function attachFunctions(db, state = {}) {
  if (!db || attached.has(db)) return
  attached.add(db)
  const f = (name, fn) => db.create_function(name, fn)

  // LIKE — переопределяем встроенный оператор SQLite
  f('like', (p, v) => tsqlLike(p, v))
  f('like', (p, v, e) => tsqlLike(p, v, e))

  // даты
  f('T_NOW', () => nowLocal(false))
  f('T_UTCNOW', () => nowLocal(true))
  f('DATEADD', (p, n, d) => dateAdd(p, n, d, false))
  f('T_DATEADD_LIT', (p, n, d) => dateAdd(p, n, d, true))
  f('DATEDIFF', (p, a, b) => dateDiff(p, a, b))
  f('DATEDIFF_BIG', (p, a, b) => dateDiff(p, a, b))
  f('DATEPART', (p, d) => datePart(p, d))
  f('DATENAME', (p, d) => dateName(p, d))
  f('YEAR', d => datePart('year', d))
  f('MONTH', d => datePart('month', d))
  f('DAY', d => datePart('day', d))
  f('EOMONTH', d => { const p = needDate(d); if (!p) return null; return fmtDate({ y: p.y, m: p.m, d: daysIn(p.y, p.m) }) })
  f('EOMONTH', (d, k) => { const x = dateAdd('month', k, d, false); const p = needDate(x); return p ? fmtDate({ y: p.y, m: p.m, d: daysIn(p.y, p.m) }) : null })
  f('DATEFROMPARTS', (y, m, d) => {
    if (y === null || m === null || d === null) return null
    const p = finish(+y, +m, +d, null, true)
    if (!p) throw kerr(289, 'Cannot construct data type date, some of the arguments have values which are not valid.')
    return fmtDate(p)
  })
  f('ISDATE', v => (parseDT(str(v)) ? 1 : 0))

  // CAST / CONVERT
  f('T_CAST', (v, t) => castValue(v, t, null, false))
  f('T_TRYCAST', (v, t) => castValue(v, t, null, true))
  f('T_CONVERT', (v, t, st) => castValue(v, t, st, false))
  f('T_TRYCONVERT', (v, t, st) => castValue(v, t, st, true))

  // строки
  f('T_LEN', v => (v === null || v === undefined ? null : String(v).replace(/ +$/, '').length))
  f('T_DATALENGTH', v => (v === null || v === undefined ? null : typeof v === 'number' ? (Number.isInteger(v) ? 4 : 8) : String(v).length))
  f('LEFT', (s, n) => (s === null || n === null ? null : String(s).slice(0, Math.max(0, num(n)))))
  f('RIGHT', (s, n) => (s === null || n === null ? null : (num(n) <= 0 ? '' : String(s).slice(-num(n)))))
  f('CHARINDEX', (sub, s) => (sub === null || s === null ? null : String(s).toLowerCase().indexOf(String(sub).toLowerCase()) + 1))
  f('CHARINDEX', (sub, s, st) => {
    if (sub === null || s === null) return null
    const from = Math.max(0, (num(st) || 1) - 1)
    return String(s).toLowerCase().indexOf(String(sub).toLowerCase(), from) + 1
  })
  f('PATINDEX', (p, s) => {
    if (p === null || s === null) return null
    const src = likeToRegex(String(p)).source.replace(/^\^/, '').replace(/\$$/, '')
    const core = src.replace(/^\[\\s\\S\]\*/, '').replace(/\[\\s\\S\]\*$/, '')
    const m = new RegExp(core, 'i').exec(String(s))
    return m ? m.index + 1 : 0
  })
  f('REPLICATE', (s, n) => (s === null || n === null ? null : String(s).repeat(Math.max(0, num(n)))))
  f('REVERSE', s => (s === null ? null : [...String(s)].reverse().join('')))
  f('SPACE', n => (n === null ? null : ' '.repeat(Math.max(0, num(n)))))
  f('STUFF', (s, st, len, rep) => {
    if (s === null || st === null || len === null) return null
    const x = String(s), i = num(st) - 1
    if (i < 0 || i >= x.length) return null
    return x.slice(0, i) + (rep === null ? '' : String(rep)) + x.slice(i + num(len))
  })
  f('STR', v => (v === null ? null : String(Math.round(num(v))).padStart(10, ' ')))
  f('FORMAT', (v, fmt) => formatFn(v, fmt))
  f('FORMAT', (v, fmt, culture) => formatFn(v, fmt, culture))
  f('ISNUMERIC', v => (v === null ? 0 : typeof v === 'number' || isNumText(String(v)) ? 1 : 0))
  f('NEWID', () => {
    const h = '0123456789ABCDEF'
    let s = ''
    for (let i = 0; i < 32; i++) s += h[(Math.random() * 16) | 0]
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${h[8 + ((Math.random() * 4) | 0)]}${s.slice(17, 20)}-${s.slice(20)}`
  })

  // математика — свои версии, чтобы не дёргать устаревшие расширения sql.js
  f('POWER', (a, b) => (a === null || b === null ? null : Math.pow(num(a), num(b))))
  f('SQRT', a => (a === null ? null : Math.sqrt(num(a))))
  f('SQUARE', a => (a === null ? null : num(a) * num(a)))
  f('FLOOR', a => (a === null ? null : Math.floor(num(a))))
  f('CEILING', a => (a === null ? null : Math.ceil(num(a))))
  f('PI', () => Math.PI)
  f('EXP', a => (a === null ? null : Math.exp(num(a))))
  f('LOG', a => (a === null ? null : Math.log(num(a))))
  f('LOG10', a => (a === null ? null : Math.log10(num(a))))
  f('SIGN', a => (a === null ? null : Math.sign(num(a))))
  f('RAND', () => Math.random())

  // служебные
  f('T_VERSION', () => 'Microsoft SQL Server 2022 — эмуляция Klerr SQL Trainer (движок SQLite в браузере)')
  f('T_ROWCOUNT', () => (state.rowcount || 0))
  f('KLERR_T', (v, base, a, b, col) => checkValue(v, base, a, b, col))
  f('KLERR_N', (v, base, a, b) => normValue(v, base, a, b))
}
