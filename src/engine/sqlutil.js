/**
 * Klerr — мелкие утилиты разбора SQL-текста, общие для движка и прослойки.
 */

/** Конец строкового литерала, начинающегося в позиции i ('…' с '' внутри). */
export function endOfString(s, i) {
  let j = i + 1
  while (j < s.length) {
    if (s[j] === "'") {
      if (s[j + 1] === "'") { j += 2; continue }
      return j + 1
    }
    j++
  }
  return s.length
}

/**
 * Маска: содержимое строк заменяется пробелами (кавычки остаются),
 * при ids=true содержимое [..] и ".." — символами «_».
 * Длина и позиции сохраняются, поэтому по маске удобно искать ключевые слова.
 */
export function mask(s, ids = false) {
  let out = ''
  for (let i = 0; i < s.length;) {
    const c = s[i]
    if (c === "'") {
      const j = endOfString(s, i)
      out += "'" + ' '.repeat(Math.max(0, j - i - 2)) + (j - i >= 2 ? "'" : '')
      i = j
      continue
    }
    if (ids && (c === '[' || c === '"')) {
      const close = c === '[' ? ']' : '"'
      const j = s.indexOf(close, i + 1)
      const e = j < 0 ? s.length : j + 1
      out += c + '_'.repeat(Math.max(0, e - i - 2)) + (j < 0 ? '' : close)
      i = e
      continue
    }
    out += c
    i++
  }
  return out
}

/** Удаляет комментарии, сохраняя переводы строк (номера строк не сдвигаются). */
export function stripCommentsKeepLines(s) {
  let out = ''
  for (let i = 0; i < s.length;) {
    const c = s[i], n = s[i + 1]
    if (c === "'") { const j = endOfString(s, i); out += s.slice(i, j); i = j; continue }
    if (c === '-' && n === '-') { while (i < s.length && s[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') {
      let depth = 1, j = i + 2
      while (j < s.length && depth) {
        if (s[j] === '/' && s[j + 1] === '*') { depth++; j += 2 } else if (s[j] === '*' && s[j + 1] === '/') { depth--; j += 2 } else j++
      }
      out += s.slice(i, j).replace(/[^\n]/g, ' ')
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

/** Индекс закрывающей скобки для открывающей в позиции open (по маске). */
export function matchParen(m, open) {
  let d = 0
  for (let i = open; i < m.length; i++) {
    if (m[i] === '(') d++
    else if (m[i] === ')') { d--; if (!d) return i }
  }
  return -1
}

/** Делит диапазон [a,b) по запятым верхнего уровня (по маске). Возвращает пары [start,end]. */
export function splitRanges(m, a, b) {
  const out = []
  let d = 0, s = a
  for (let i = a; i < b; i++) {
    const c = m[i]
    if (c === '(') d++
    else if (c === ')') d--
    else if (c === ',' && d === 0) { out.push([s, i]); s = i + 1 }
  }
  out.push([s, b])
  return out
}

/** Делит текст по запятым верхнего уровня. */
export function splitTopText(s) {
  const m = mask(s, true)
  return splitRanges(m, 0, s.length).map(([a, b]) => s.slice(a, b))
}

/** Снимает [..], "..", `..` с идентификатора. */
export const unq = s => {
  const t = String(s).trim()
  if ((t[0] === '[' && t.endsWith(']')) || (t[0] === '"' && t.endsWith('"')) || (t[0] === '`' && t.endsWith('`'))) {
    return t.slice(1, -1).replace(/""/g, '"')
  }
  return t
}

/** Идентификатор в двойных кавычках для SQLite. */
export const qi = s => '"' + String(s).replace(/"/g, '""') + '"'

/** Строковый литерал SQL. */
export const ql = s => "'" + String(s).replace(/'/g, "''") + "'"

/** Делит «a.b.[c d]» на части (с учётом скобок). Пустые части сохраняются (a..b). */
export function splitDotted(s) {
  const parts = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '[') { const j = s.indexOf(']', i); cur += s.slice(i, j < 0 ? s.length : j + 1); i = j < 0 ? s.length : j; continue }
    if (c === '"') { const j = s.indexOf('"', i + 1); cur += s.slice(i, j < 0 ? s.length : j + 1); i = j < 0 ? s.length : j; continue }
    if (c === '.') { parts.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  parts.push(cur.trim())
  return parts
}
