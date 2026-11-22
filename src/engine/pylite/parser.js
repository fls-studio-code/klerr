/**
 * Парсер мини-Python: токены → дерево (AST).
 *
 * Поддержано: присваивания (в т.ч. распаковка), if/elif/else, for, while,
 * def/return/lambda, try/except, import/from-import, списки/словари/кортежи,
 * генераторы списков и словарей, срезы, f-строки, вызовы с именованными аргументами.
 * Не поддержано (и даёт понятную ошибку): class, with, yield, async, множества, декораторы.
 */
import { PyError } from './errors.js'
import { tokenize, unescape, KEYWORDS } from './lexer.js'

const UNSUPPORTED = {
  class: 'классы (class)',
  with: 'оператор with',
  global: 'global',
  nonlocal: 'nonlocal',
  del: 'del',
  yield: 'yield',
  async: 'async',
  await: 'await',
  assert: 'assert',
  finally: 'блок finally',
}

const AUG = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**='])
const CMP = new Set(['<', '>', '<=', '>=', '==', '!='])

class Parser {
  constructor(tokens) {
    this.toks = tokens
    this.p = 0
  }

  /* ---------- вспомогательные ---------- */
  peek(k = 0) { return this.toks[Math.min(this.p + k, this.toks.length - 1)] }
  next() { return this.toks[this.p++] }
  isOp(v, k = 0) { const t = this.peek(k); return t.type === 'OP' && t.value === v }
  isKw(v, k = 0) { const t = this.peek(k); return t.type === 'NAME' && t.value === v }
  matchOp(v) { if (this.isOp(v)) { this.p++; return true } return false }
  matchKw(v) { if (this.isKw(v)) { this.p++; return true } return false }

  err(msg, hint = '', tok = this.peek()) {
    throw new PyError('SyntaxError', msg, tok.line, hint)
  }

  expectOp(v, hint = '') {
    if (!this.isOp(v)) {
      this.err('invalid syntax', hint || `Ожидалось «${v}», а здесь: ${describe(this.peek())}.`)
    }
    return this.next()
  }

  expectKw(v, hint = '') {
    if (!this.isKw(v)) this.err('invalid syntax', hint || `Ожидалось слово «${v}», а здесь: ${describe(this.peek())}.`)
    return this.next()
  }

  expectName() {
    const t = this.peek()
    if (t.type !== 'NAME' || KEYWORDS.has(t.value)) this.err('invalid syntax', `Ожидалось имя, а здесь: ${describe(t)}.`)
    this.p++
    return t.value
  }

  /* ---------- программа и блоки ---------- */
  parseProgram() {
    const body = []
    while (this.peek().type !== 'EOF') {
      if (this.peek().type === 'NEWLINE') { this.p++; continue }
      this.parseStatementInto(body)
    }
    return body
  }

  parseBlock() {
    this.expectOp(':', 'В конце строки с if / for / def / while / else / try нужно двоеточие «:».')
    const body = []
    if (this.peek().type === 'NEWLINE') {
      this.p++
      if (this.peek().type !== 'INDENT') {
        throw new PyError('IndentationError', 'expected an indented block', this.peek().line,
          'После двоеточия следующая строка должна быть с отступом (обычно 4 пробела).')
      }
      this.p++
      while (this.peek().type !== 'DEDENT' && this.peek().type !== 'EOF') {
        if (this.peek().type === 'NEWLINE') { this.p++; continue }
        this.parseStatementInto(body)
      }
      if (this.peek().type === 'DEDENT') this.p++
    } else {
      this.parseSimpleLine(body)
    }
    return body
  }

  parseStatementInto(out) {
    const t = this.peek()
    if (t.type === 'INDENT') {
      throw new PyError('IndentationError', 'unexpected indent', t.line, 'Лишний отступ: строка сдвинута вправо без причины.')
    }
    if (t.type === 'NAME' && KEYWORDS.has(t.value)) {
      switch (t.value) {
        case 'if': out.push(this.parseIf()); return
        case 'for': out.push(this.parseFor()); return
        case 'while': out.push(this.parseWhile()); return
        case 'def': out.push(this.parseDef()); return
        case 'try': out.push(this.parseTry()); return
        default:
          if (UNSUPPORTED[t.value]) {
            this.err(`${UNSUPPORTED[t.value]} не поддерживается`, `В этом тренажёре нет конструкции «${t.value}». Для урока хватает функций, циклов и условий.`)
          }
      }
    }
    this.parseSimpleLine(out)
  }

  parseSimpleLine(out) {
    out.push(this.parseSimple())
    while (this.matchOp(';')) {
      if (this.peek().type === 'NEWLINE' || this.peek().type === 'EOF') break
      out.push(this.parseSimple())
    }
    this.endLine()
  }

  endLine() {
    const t = this.peek()
    if (t.type === 'NEWLINE') { this.p++; return }
    if (t.type === 'EOF' || t.type === 'DEDENT') return
    this.err('invalid syntax', `Лишнее в конце строки: ${describe(t)}. Возможно, пропущена запятая, скобка или оператор.`)
  }

  /* ---------- составные операторы ---------- */
  parseIf() {
    const line = this.next().line // if / elif
    const test = this.parseTest()
    const body = this.parseBlock()
    let orelse = []
    if (this.isKw('elif')) {
      orelse = [this.parseIf()]
    } else if (this.matchKw('else')) {
      orelse = this.parseBlock()
    }
    return { t: 'If', test, body, orelse, line }
  }

  parseFor() {
    const line = this.next().line
    const target = this.parseTargetList()
    this.expectKw('in', 'В цикле for нужно слово «in»: for x in список:')
    const iter = this.parseExprList()
    const body = this.parseBlock()
    if (this.isKw('else')) this.err('else у цикла не поддерживается')
    return { t: 'For', target, iter, body, line }
  }

  parseWhile() {
    const line = this.next().line
    const test = this.parseTest()
    const body = this.parseBlock()
    if (this.isKw('else')) this.err('else у цикла не поддерживается')
    return { t: 'While', test, body, line }
  }

  parseDef() {
    const line = this.next().line
    const name = this.expectName()
    this.expectOp('(')
    const params = this.parseParams(')')
    this.expectOp(')')
    const body = this.parseBlock()
    return { t: 'Def', name, params, body, line }
  }

  parseParams(end) {
    const params = []
    while (!this.isOp(end) && !(end === ':' && this.isOp(':'))) {
      const name = this.expectName()
      let def = null
      if (this.matchOp('=')) def = this.parseTest()
      params.push({ name, def })
      if (!this.matchOp(',')) break
    }
    return params
  }

  parseTry() {
    const line = this.next().line
    const body = this.parseBlock()
    const handlers = []
    while (this.isKw('except')) {
      const hl = this.next().line
      let type = null
      let name = null
      if (!this.isOp(':')) {
        type = this.parseTest()
        if (this.matchKw('as')) name = this.expectName()
      }
      handlers.push({ type, name, body: this.parseBlock(), line: hl })
    }
    if (!handlers.length) this.err("expected 'except' block", 'После try нужен блок except:')
    if (this.isKw('else')) this.err('else у try не поддерживается')
    if (this.isKw('finally')) this.err('блок finally не поддерживается')
    return { t: 'Try', body, handlers, line }
  }

  /* ---------- простые операторы ---------- */
  parseSimple() {
    const t = this.peek()
    const line = t.line
    if (t.type === 'NAME') {
      switch (t.value) {
        case 'pass': this.p++; return { t: 'Pass', line }
        case 'break': this.p++; return { t: 'Break', line }
        case 'continue': this.p++; return { t: 'Continue', line }
        case 'return': {
          this.p++
          const nt = this.peek()
          const value = nt.type === 'NEWLINE' || nt.type === 'EOF' || nt.type === 'DEDENT' || this.isOp(';') ? null : this.parseExprList()
          return { t: 'Return', value, line }
        }
        case 'raise': {
          this.p++
          const nt = this.peek()
          const value = nt.type === 'NEWLINE' || nt.type === 'EOF' ? null : this.parseTest()
          return { t: 'Raise', value, line }
        }
        case 'import': return this.parseImport()
        case 'from': return this.parseFromImport()
        default:
          if (UNSUPPORTED[t.value]) {
            this.err(`${UNSUPPORTED[t.value]} не поддерживается`, `В этом тренажёре нет конструкции «${t.value}».`)
          }
      }
    }

    const e = this.parseExprList()

    if (this.isOp('=')) {
      const targets = [e]
      let value = null
      while (this.matchOp('=')) {
        const rhs = this.parseExprList()
        if (this.isOp('=')) targets.push(rhs)
        else value = rhs
      }
      for (const tg of targets) this.checkTarget(tg, line)
      return { t: 'Assign', targets, value, line }
    }

    const ot = this.peek()
    if (ot.type === 'OP' && AUG.has(ot.value)) {
      this.p++
      this.checkTarget(e, line)
      if (e.t === 'Tuple' || e.t === 'List') this.err('invalid syntax', 'Составное присваивание (+=, -=…) работает только с одной переменной.')
      const value = this.parseExprList()
      return { t: 'AugAssign', op: ot.value.slice(0, -1), target: e, value, line }
    }

    return { t: 'Expr', e, line }
  }

  checkTarget(n, line) {
    switch (n.t) {
      case 'Name': case 'Attr': case 'Sub': return
      case 'Tuple': case 'List': n.items.forEach(x => this.checkTarget(x, line)); return
      default:
        throw new PyError('SyntaxError', 'cannot assign to expression', line,
          'Слева от «=» должна стоять переменная (или элемент списка/словаря). Для сравнения используй «==».')
    }
  }

  dottedName() {
    let name = this.expectName()
    while (this.matchOp('.')) name += '.' + this.expectName()
    return name
  }

  parseImport() {
    const line = this.next().line
    const names = []
    do {
      const mod = this.dottedName()
      const alias = this.matchKw('as') ? this.expectName() : null
      names.push([mod, alias])
    } while (this.matchOp(','))
    return { t: 'Import', names, line }
  }

  parseFromImport() {
    const line = this.next().line
    const module = this.dottedName()
    this.expectKw('import', 'После «from модуль» нужно слово import: from transformers import pipeline')
    if (this.isOp('*')) this.err('import * не поддерживается', 'Перечисли нужные имена: from transformers import pipeline, set_seed')
    const paren = this.matchOp('(')
    const names = []
    do {
      if (paren && this.isOp(')')) break
      const name = this.expectName()
      const alias = this.matchKw('as') ? this.expectName() : null
      names.push([name, alias])
    } while (this.matchOp(','))
    if (paren) this.expectOp(')')
    return { t: 'ImportFrom', module, names, line }
  }

  /* ---------- выражения ---------- */
  atListEnd() {
    const t = this.peek()
    return t.type === 'NEWLINE' || t.type === 'EOF' || t.type === 'DEDENT' ||
      (t.type === 'OP' && (t.value === ')' || t.value === ']' || t.value === '}' || t.value === '=' || t.value === ':' || t.value === ';' || AUG.has(t.value)))
  }

  /** a, b, c → Tuple (без скобок), либо одно выражение */
  parseExprList() {
    const line = this.peek().line
    const first = this.parseTest()
    if (!this.isOp(',')) return first
    const items = [first]
    while (this.matchOp(',')) {
      if (this.atListEnd()) break
      items.push(this.parseTest())
    }
    return { t: 'Tuple', items, line }
  }

  /** цель присваивания в for / генераторах: x   или   a, b   или   (a, b) */
  parseTargetList() {
    const line = this.peek().line
    const first = this.parsePrimary()
    if (!this.isOp(',')) { this.checkTarget(first, line); return first }
    const items = [first]
    while (this.matchOp(',')) {
      if (this.isKw('in')) break
      items.push(this.parsePrimary())
    }
    const tup = { t: 'Tuple', items, line }
    this.checkTarget(tup, line)
    return tup
  }

  parseTest() {
    if (this.isKw('lambda')) return this.parseLambda()
    const line = this.peek().line
    const body = this.parseOr()
    if (this.isKw('if')) {
      this.p++
      const test = this.parseOr()
      this.expectKw('else', 'В выражении «A if условие else B» нужна часть else.')
      const orelse = this.parseTest()
      return { t: 'IfExp', test, body, orelse, line }
    }
    return body
  }

  parseLambda() {
    const line = this.next().line
    const params = this.parseParams(':')
    this.expectOp(':')
    const body = this.parseTest()
    return { t: 'Lambda', params, body, line }
  }

  parseOr() {
    let left = this.parseAnd()
    while (this.isKw('or')) {
      const line = this.next().line
      left = { t: 'BoolOp', op: 'or', l: left, r: this.parseAnd(), line }
    }
    return left
  }

  parseAnd() {
    let left = this.parseNot()
    while (this.isKw('and')) {
      const line = this.next().line
      left = { t: 'BoolOp', op: 'and', l: left, r: this.parseNot(), line }
    }
    return left
  }

  parseNot() {
    if (this.isKw('not')) {
      const line = this.next().line
      return { t: 'Not', e: this.parseNot(), line }
    }
    return this.parseComparison()
  }

  parseComparison() {
    const line = this.peek().line
    const first = this.parseArith()
    const ops = []
    for (;;) {
      const t = this.peek()
      let op = null
      if (t.type === 'OP' && CMP.has(t.value)) { op = t.value; this.p++ }
      else if (this.isKw('in')) { op = 'in'; this.p++ }
      else if (this.isKw('not') && this.isKw('in', 1)) { op = 'not in'; this.p += 2 }
      else if (this.isKw('is')) {
        this.p++
        op = this.matchKw('not') ? 'is not' : 'is'
      }
      if (!op) break
      ops.push([op, this.parseArith()])
    }
    return ops.length ? { t: 'Compare', first, ops, line } : first
  }

  parseArith() {
    let left = this.parseTerm()
    while (this.isOp('+') || this.isOp('-')) {
      const t = this.next()
      left = { t: 'BinOp', op: t.value, l: left, r: this.parseTerm(), line: t.line }
    }
    return left
  }

  parseTerm() {
    let left = this.parseUnary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      const t = this.next()
      left = { t: 'BinOp', op: t.value, l: left, r: this.parseUnary(), line: t.line }
    }
    return left
  }

  parseUnary() {
    if (this.isOp('-') || this.isOp('+')) {
      const t = this.next()
      return { t: 'Unary', op: t.value, e: this.parseUnary(), line: t.line }
    }
    return this.parsePower()
  }

  parsePower() {
    const base = this.parsePrimary()
    if (this.isOp('**')) {
      const t = this.next()
      return { t: 'BinOp', op: '**', l: base, r: this.parseUnary(), line: t.line }
    }
    return base
  }

  parsePrimary() {
    let node = this.parseAtom()
    for (;;) {
      const t = this.peek()
      if (t.type !== 'OP') break
      if (t.value === '(') {
        this.p++
        node = this.parseCall(node, t.line)
      } else if (t.value === '[') {
        this.p++
        const idx = this.parseSubscript()
        this.expectOp(']', 'Не закрыта квадратная скобка «[».')
        node = { t: 'Sub', obj: node, idx, line: t.line }
      } else if (t.value === '.') {
        this.p++
        const name = this.expectName()
        node = { t: 'Attr', obj: node, name, line: t.line }
      } else break
    }
    return node
  }

  parseCall(fn, line) {
    const args = []
    const kws = []
    while (!this.isOp(')')) {
      if (this.isOp('*')) {
        this.p++
        args.push({ star: true, e: this.parseTest() })
      } else if (this.isOp('**')) {
        this.p++
        kws.push({ name: null, e: this.parseTest() })
      } else if (this.peek().type === 'NAME' && !KEYWORDS.has(this.peek().value) && this.isOp('=', 1)) {
        const name = this.next().value
        this.p++
        kws.push({ name, e: this.parseTest() })
      } else {
        if (kws.some(k => k.name !== null)) this.err('positional argument follows keyword argument', 'Сначала идут обычные аргументы, потом именованные (name=значение).')
        args.push({ star: false, e: this.parseTest() })
      }
      if (!this.matchOp(',')) break
    }
    this.expectOp(')', 'Не закрыта круглая скобка «(» в вызове функции.')
    return { t: 'Call', fn, args, kws, line }
  }

  parseSubscript() {
    const line = this.peek().line
    let lower = null
    let upper = null
    let step = null
    let slice = false
    if (!this.isOp(':')) lower = this.parseTest()
    if (this.matchOp(':')) {
      slice = true
      if (!this.isOp(':') && !this.isOp(']')) upper = this.parseTest()
      if (this.matchOp(':')) {
        if (!this.isOp(']')) step = this.parseTest()
      }
    }
    return slice ? { t: 'Slice', lower, upper, step, line } : lower
  }

  parseComprehensionClauses() {
    const gens = []
    while (this.isKw('for')) {
      this.p++
      const target = this.parseTargetList()
      this.expectKw('in')
      const iter = this.parseOr()
      const ifs = []
      while (this.isKw('if')) { this.p++; ifs.push(this.parseOr()) }
      gens.push({ target, iter, ifs })
    }
    return gens
  }

  parseAtom() {
    const t = this.peek()
    const line = t.line
    switch (t.type) {
      case 'NUMBER': this.p++; return { t: 'Num', v: t.value, line }
      case 'STRING': return this.parseStrings()
      case 'NAME': {
        if (t.value === 'True') { this.p++; return { t: 'Const', v: true, line } }
        if (t.value === 'False') { this.p++; return { t: 'Const', v: false, line } }
        if (t.value === 'None') { this.p++; return { t: 'Const', v: null, line } }
        if (KEYWORDS.has(t.value)) {
          this.err('invalid syntax', `Слово «${t.value}» здесь стоит не на своём месте.`)
        }
        this.p++
        return { t: 'Name', id: t.value, line }
      }
      case 'OP': {
        if (t.value === '(') {
          this.p++
          if (this.matchOp(')')) return { t: 'Tuple', items: [], line }
          const first = this.parseTest()
          if (this.isKw('for')) {
            const gens = this.parseComprehensionClauses()
            this.expectOp(')')
            return { t: 'Comp', kind: 'list', elt: first, gens, line }
          }
          if (this.isOp(',')) {
            const items = [first]
            while (this.matchOp(',')) {
              if (this.isOp(')')) break
              items.push(this.parseTest())
            }
            this.expectOp(')', 'Не закрыта круглая скобка «(».')
            return { t: 'Tuple', items, line }
          }
          this.expectOp(')', 'Не закрыта круглая скобка «(».')
          return first
        }
        if (t.value === '[') {
          this.p++
          if (this.matchOp(']')) return { t: 'List', items: [], line }
          const first = this.parseTest()
          if (this.isKw('for')) {
            const gens = this.parseComprehensionClauses()
            this.expectOp(']', 'Не закрыта квадратная скобка «[».')
            return { t: 'Comp', kind: 'list', elt: first, gens, line }
          }
          const items = [first]
          while (this.matchOp(',')) {
            if (this.isOp(']')) break
            items.push(this.parseTest())
          }
          this.expectOp(']', 'Не закрыта квадратная скобка «[» (проверь запятые между элементами).')
          return { t: 'List', items, line }
        }
        if (t.value === '{') {
          this.p++
          if (this.matchOp('}')) return { t: 'Dict', items: [], line }
          const k = this.parseTest()
          if (!this.isOp(':')) this.err('множества (set) не поддерживаются', 'Используй список [..] или словарь {ключ: значение}.')
          this.p++
          const v = this.parseTest()
          if (this.isKw('for')) {
            const gens = this.parseComprehensionClauses()
            this.expectOp('}')
            return { t: 'Comp', kind: 'dict', key: k, elt: v, gens, line }
          }
          const items = [[k, v]]
          while (this.matchOp(',')) {
            if (this.isOp('}')) break
            const k2 = this.parseTest()
            this.expectOp(':', 'В словаре между ключом и значением нужно двоеточие.')
            items.push([k2, this.parseTest()])
          }
          this.expectOp('}', 'Не закрыта фигурная скобка «{».')
          return { t: 'Dict', items, line }
        }
        break
      }
      default:
    }
    this.err('invalid syntax', `Здесь ожидалось значение, а найдено: ${describe(t)}.`)
  }

  /** подряд идущие литералы склеиваются: "a" "b" → "ab"; f-строки раскладываются на части */
  parseStrings() {
    const line = this.peek().line
    const parts = []
    let anyF = false
    while (this.peek().type === 'STRING') {
      const t = this.next()
      if (t.fstr) {
        anyF = true
        for (const p of parseFString(t.value, t.raw, t.line)) parts.push(p)
      } else {
        parts.push({ lit: t.value })
      }
    }
    if (!anyF) return { t: 'Str', v: parts.map(p => p.lit).join(''), line }
    return { t: 'FStr', parts, line }
  }
}

function describe(t) {
  switch (t.type) {
    case 'NEWLINE': return 'конец строки'
    case 'EOF': return 'конец программы'
    case 'INDENT': return 'отступ'
    case 'DEDENT': return 'конец блока'
    case 'STRING': return 'строка'
    case 'NUMBER': return `число ${t.value}`
    default: return `«${t.value}»`
  }
}

/** Разбор содержимого f-строки: литералы и {выражения!r:формат}. */
function parseFString(body, raw, line) {
  const parts = []
  let lit = ''
  let i = 0
  const n = body.length
  const flush = () => { if (lit) { parts.push({ lit: raw ? lit : unescape(lit) }); lit = '' } }
  while (i < n) {
    const c = body[i]
    if (c === '{') {
      if (body[i + 1] === '{') { lit += '{'; i += 2; continue }
      flush()
      // ищем парную «}» с учётом вложенных скобок и строк
      let depth = 1
      let j = i + 1
      let quote = null
      while (j < n && depth > 0) {
        const ch = body[j]
        if (quote) { if (ch === quote) quote = null }
        else if (ch === "'" || ch === '"') quote = ch
        else if (ch === '{' || ch === '[' || ch === '(') depth++
        else if (ch === '}' || ch === ']' || ch === ')') depth--
        j++
      }
      if (depth > 0) throw new PyError('SyntaxError', "f-string: expecting '}'", line, 'В f-строке не закрыта фигурная скобка.')
      const inner = body.slice(i + 1, j - 1)
      // отделяем !r и :формат на верхнем уровне
      let exprEnd = inner.length
      let depth2 = 0
      let q2 = null
      for (let k = 0; k < inner.length; k++) {
        const ch = inner[k]
        if (q2) { if (ch === q2) q2 = null; continue }
        if (ch === "'" || ch === '"') { q2 = ch; continue }
        if ('([{'.includes(ch)) depth2++
        else if (')]}'.includes(ch)) depth2--
        else if (depth2 === 0 && ch === ':') { exprEnd = k; break }
        else if (depth2 === 0 && ch === '!' && inner[k + 1] !== '=') { exprEnd = k; break }
      }
      const exprText = inner.slice(0, exprEnd)
      let rest = inner.slice(exprEnd)
      let conv = null
      let spec = null
      if (rest[0] === '!') { conv = rest[1]; rest = rest.slice(2) }
      if (rest[0] === ':') spec = rest.slice(1)
      if (!exprText.trim()) throw new PyError('SyntaxError', 'f-string: empty expression not allowed', line, 'Внутри { } в f-строке нужно выражение.')
      parts.push({ expr: parseExpressionText(exprText, line), conv, spec })
      i = j
      continue
    }
    if (c === '}') {
      if (body[i + 1] === '}') { lit += '}'; i += 2; continue }
      throw new PyError('SyntaxError', "f-string: single '}' is not allowed", line, 'Одиночная «}» в f-строке: удвой её («}}»), если нужна сама скобка.')
    }
    lit += c
    i++
  }
  flush()
  return parts
}

function parseExpressionText(text, line) {
  const p = new Parser(tokenize('(' + text.trim() + ')\n', line))
  const e = p.parseTest()
  if (p.peek().type !== 'NEWLINE') throw new PyError('SyntaxError', 'invalid syntax', line, 'Ошибка в выражении внутри f-строки.')
  return e
}

export function parse(src) {
  return new Parser(tokenize(src)).parseProgram()
}
