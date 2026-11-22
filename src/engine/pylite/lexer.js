/**
 * Лексер мини-Python: превращает текст программы в поток токенов
 * (NAME, NUMBER, STRING, OP, NEWLINE, INDENT, DEDENT, EOF).
 * Отступы работают как в Python: блоки открывает INDENT, закрывает DEDENT.
 */
import { PyError } from './errors.js'

export const KEYWORDS = new Set([
  'and', 'as', 'break', 'continue', 'def', 'elif', 'else', 'except', 'for', 'from', 'if', 'import',
  'in', 'is', 'lambda', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  // не поддерживаются, но должны давать понятную ошибку, а не «invalid syntax»
  'class', 'with', 'global', 'nonlocal', 'del', 'yield', 'async', 'await', 'assert', 'finally',
])

const OPS3 = new Set(['**=', '//='])
const OPS2 = new Set(['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->'])
const OPS1 = new Set('+-*/%<>=()[]{},:.;'.split(''))

const ESC = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', 0: '\0', a: '\x07', b: '\b', f: '\f', v: '\v' }

/** Разворачивает \n, \t, \xNN, \uNNNN в обычных строках. Неизвестные escape остаются как есть (как в Python). */
export function unescape(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|\n|[\s\S])/g, (m, g) => {
    if (g === '\n') return ''
    if (g.length === 3 && g[0] === 'x') return String.fromCharCode(parseInt(g.slice(1), 16))
    if (g.length === 5 && g[0] === 'u') return String.fromCharCode(parseInt(g.slice(1), 16))
    return ESC[g] ?? m
  })
}

const STR_START = /([rRfF]{0,2})('''|"""|'|")/y
const NUM = /(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?/y
const IDENT = /[\p{L}_][\p{L}\p{N}_]*/uy

export function tokenize(src, startLine = 1) {
  const toks = []
  const n = src.length
  let i = 0
  let line = startLine
  let depth = 0
  let atStart = true
  const indents = [0]

  const push = (type, value, extra) => toks.push({ type, value, line, ...extra })
  const syntax = (msg, hint = '') => { throw new PyError('SyntaxError', msg, line, hint) }

  while (i < n) {
    if (atStart && depth === 0) {
      let col = 0
      let j = i
      while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 4 - (col % 4) : 1; j++ }
      if (j >= n) break
      if (src[j] === '\n' || src[j] === '\r' || src[j] === '#') {
        // пустая строка или строка-комментарий: отступы не учитываем
        while (j < n && src[j] !== '\n') j++
        if (j < n) { j++; line++ }
        i = j
        continue
      }
      const top = indents[indents.length - 1]
      if (col > top) {
        indents.push(col)
        push('INDENT')
      } else if (col < top) {
        while (col < indents[indents.length - 1]) { indents.pop(); push('DEDENT') }
        if (col !== indents[indents.length - 1]) {
          throw new PyError('IndentationError', 'unindent does not match any outer indentation level', line,
            'Отступы в блоке должны быть одинаковыми: используй одно и то же число пробелов.')
        }
      }
      i = j
      atStart = false
    }

    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue }
    if (c === '\n') {
      if (depth > 0) { line++; i++; continue }
      push('NEWLINE')
      line++
      i++
      atStart = true
      continue
    }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue }

    // строки: '…', "…", '''…''', f"…", r"…"
    STR_START.lastIndex = i
    const sm = STR_START.exec(src)
    if (sm) {
      const prefix = sm[1].toLowerCase()
      const q = sm[2]
      const raw = prefix.includes('r')
      const fstr = prefix.includes('f')
      const startLine = line
      let j = i + sm[0].length
      let body = ''
      let closed = false
      while (j < n) {
        const ch = src[j]
        if (ch === '\\') {
          body += ch + (src[j + 1] ?? '')
          if (src[j + 1] === '\n') line++
          j += 2
          continue
        }
        if (src.startsWith(q, j)) { closed = true; j += q.length; break }
        if (ch === '\n') {
          if (q.length === 1) { line = startLine; syntax('unterminated string literal', 'Строка не закрыта: не хватает закрывающей кавычки на этой строке.') }
          line++
        }
        body += ch
        j++
      }
      if (!closed) { line = startLine; syntax('unterminated string literal', 'Строка не закрыта: не хватает закрывающей кавычки.') }
      toks.push({ type: 'STRING', value: fstr || raw ? body : unescape(body), fstr, raw, line: startLine })
      i = j
      continue
    }

    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      NUM.lastIndex = i
      const m = NUM.exec(src)
      const text = m[0]
      i += text.length
      if (i < n && /[\p{L}_]/u.test(src[i])) syntax('invalid decimal literal', 'Имя переменной не может начинаться с цифры.')
      push('NUMBER', Number(text.replace(/_/g, '')), { isFloat: /[.eE]/.test(text) })
      continue
    }

    IDENT.lastIndex = i
    const im = IDENT.exec(src)
    if (im) {
      push('NAME', im[0])
      i += im[0].length
      continue
    }

    const three = src.substr(i, 3)
    const two = src.substr(i, 2)
    let op = null
    if (OPS3.has(three)) op = three
    else if (OPS2.has(two)) op = two
    else if (OPS1.has(c)) op = c
    if (!op) {
      syntax(`invalid character '${c}'`, c === '“' || c === '”' || c === '‘' || c === '’'
        ? 'Это «умные» кавычки. Используй обычные: " или \'.'
        : 'Этот символ нельзя использовать в программе.')
    }
    if (op.length === 1 && '([{'.includes(op)) depth++
    else if (op.length === 1 && ')]}'.includes(op)) depth = Math.max(0, depth - 1)
    push('OP', op)
    i += op.length
  }

  if (depth > 0) syntax('unexpected EOF while parsing', 'Где-то не закрыта скобка: проверь пары ( ) [ ] { }.')
  if (toks.length && toks[toks.length - 1].type !== 'NEWLINE') push('NEWLINE')
  while (indents.length > 1) { indents.pop(); push('DEDENT') }
  push('EOF')
  return toks
}
