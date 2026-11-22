/**
 * Вычислитель мини-Python. Асинхронный: вызовы моделей (pipeline) ждут ответа,
 * при этом интерфейс не зависает, а выполнение можно остановить кнопкой Stop.
 *
 * Использование:
 *   const res = await runProgram(код, { write, ml, cancel })
 *   res → { ok, ms, error: { type, message, line, hint } | null }
 */
import { PyError } from './errors.js'
import { parse } from './parser.js'
import {
  PyObj, mkTuple, isTuple, typeName, truthy, pyStr, pyRepr, formatValue,
  deepEq, compare, suggest,
} from './values.js'
import {
  toIter, getItem, setItem, makeGetAttr, createBuiltins, createModules, createRng,
  excMatches, excFromError, makeExc, MODULE_HINTS,
} from './builtins.js'

const UNSET = Symbol('unset')
const BREAK = { k: 'break' }
const CONTINUE = { k: 'continue' }
const MAX_DEPTH = 150
const noKw = () => Object.create(null)
const yieldUI = () => new Promise(r => setTimeout(r, 0))

class Scope {
  constructor(parent = null) {
    this.vars = new Map()
    this.parent = parent
  }

  lookup(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return s.vars.get(name)
    }
    return UNSET
  }

  names() {
    const out = new Set()
    for (let s = this; s; s = s.parent) for (const k of s.vars.keys()) out.add(k)
    return [...out]
  }
}

const NEEDS_IMPORT = {
  pipeline: 'from transformers import pipeline',
  set_seed: 'from transformers import set_seed',
  AutoTokenizer: 'from transformers import AutoTokenizer',
}

class Interp {
  constructor(io) {
    this.io = io
    this.steps = 0
    this.maxSteps = io.maxSteps ?? 3_000_000
    this.depth = 0
    this.excStack = []
    this.rng = createRng()
    const call = (fn, args, kw) => this.callValue(fn, args, kw ?? noKw())
    this.getAttr = makeGetAttr(call)
    const ctx = { call, write: io.write, ml: io.ml, rng: this.rng, cancel: io.cancel }
    this.builtins = new Scope()
    for (const [k, v] of createBuiltins(ctx)) this.builtins.vars.set(k, v)
    this.modules = createModules(ctx)
    this.global = new Scope(this.builtins)
  }

  async tick() {
    if (this.io.cancel.value) throw new PyError('KeyboardInterrupt', 'Выполнение остановлено', null, '')
    if (++this.steps > this.maxSteps) {
      throw new PyError('RuntimeError', 'программа выполняется слишком долго', null,
        'Похоже на бесконечный цикл. Проверь условие в while или добавь break.')
    }
    if (this.steps % 400 === 0) await yieldUI()
  }

  /* ---------- вызовы ---------- */
  async callValue(fn, args, kw) {
    if (typeof fn !== 'function') {
      throw new PyError('TypeError', `'${typeName(fn)}' object is not callable`, null,
        'Так вызывают только функции. Возможно, имя переменной совпало с именем функции, или поставлена лишняя пара скобок.')
    }
    return fn(args, kw)
  }

  /* ---------- модуль ---------- */
  async run(tree) {
    const sig = await this.execBlock(tree, this.global)
    if (sig && sig.k === 'return') throw new PyError('SyntaxError', "'return' outside function", null, 'return можно писать только внутри функции (def).')
    if (sig) throw new PyError('SyntaxError', `'${sig.k}' outside loop`, null, `${sig.k} работает только внутри цикла.`)
  }

  /* ---------- операторы ---------- */
  async execBlock(stmts, sc) {
    for (const s of stmts) {
      const sig = await this.exec(s, sc)
      if (sig) return sig
    }
    return undefined
  }

  async exec(s, sc) {
    await this.tick()
    try {
      return await this.execInner(s, sc)
    } catch (e) {
      if (e instanceof PyError && e.line == null) e.line = s.line
      throw e
    }
  }

  async execInner(s, sc) {
    switch (s.t) {
      case 'Expr':
        await this.ev(s.e, sc)
        return undefined
      case 'Assign': {
        const v = await this.ev(s.value, sc)
        for (const t of s.targets) await this.assign(t, v, sc)
        return undefined
      }
      case 'AugAssign': {
        const cur = await this.ev(s.target, sc)
        const rhs = await this.ev(s.value, sc)
        if (s.op === '+' && Array.isArray(cur) && !isTuple(cur) && Array.isArray(rhs)) {
          cur.push(...rhs)
          return undefined
        }
        await this.assign(s.target, this.binop(s.op, cur, rhs), sc)
        return undefined
      }
      case 'If': {
        if (truthy(await this.ev(s.test, sc))) return this.execBlock(s.body, sc)
        return this.execBlock(s.orelse, sc)
      }
      case 'For': {
        const it = await this.ev(s.iter, sc)
        const items = toIter(it) // для списка это он сам, поэтому добавление элементов в цикле видно, как в Python
        for (let i = 0; i < items.length; i++) {
          await this.assign(s.target, items[i], sc)
          const sig = await this.execBlock(s.body, sc)
          if (sig === BREAK) break
          if (sig && sig !== CONTINUE) return sig
        }
        return undefined
      }
      case 'While': {
        while (truthy(await this.ev(s.test, sc))) {
          const sig = await this.execBlock(s.body, sc)
          if (sig === BREAK) break
          if (sig && sig !== CONTINUE) return sig
          await this.tick()
        }
        return undefined
      }
      case 'Def': {
        const defaults = []
        for (const p of s.params) defaults.push(p.def ? await this.ev(p.def, sc) : UNSET)
        sc.vars.set(s.name, this.makeFunction(s.name, s.params, defaults, s.body, null, sc))
        return undefined
      }
      case 'Return':
        return { k: 'return', v: s.value ? await this.ev(s.value, sc) : null }
      case 'Pass': return undefined
      case 'Break': return BREAK
      case 'Continue': return CONTINUE
      case 'Import': {
        for (const [name, alias] of s.names) {
          const mod = this.modules[name]
          if (!mod) throw this.noModule(name)
          sc.vars.set(alias ?? name.split('.')[0], mod)
        }
        return undefined
      }
      case 'ImportFrom': {
        const mod = this.modules[s.module]
        if (!mod) throw this.noModule(s.module)
        for (const [name, alias] of s.names) {
          if (!Object.prototype.hasOwnProperty.call(mod.attrs, name)) {
            throw new PyError('ImportError', `cannot import name '${name}' from '${s.module}'`, null,
              `В тренажёре из «${s.module}» доступно: ${Object.keys(mod.attrs).join(', ')}.`)
          }
          sc.vars.set(alias ?? name, mod.attrs[name])
        }
        return undefined
      }
      case 'Try': return this.execTry(s, sc)
      case 'Raise': {
        if (s.value === null) {
          const cur = this.excStack[this.excStack.length - 1]
          if (!cur) throw new PyError('RuntimeError', 'No active exception to reraise')
          throw cur
        }
        let v = await this.ev(s.value, sc)
        if (typeof v === 'function' && v.excName) v = makeExc(v.excName, [])
        if (!(v instanceof PyObj) || !v.isExc) throw new PyError('TypeError', 'exceptions must derive from BaseException', null, 'После raise укажи исключение: raise ValueError("текст").')
        throw new PyError(v.type, v.str(), null)
      }
      default:
        throw new PyError('SyntaxError', `неизвестный оператор ${s.t}`)
    }
  }

  noModule(name) {
    return new PyError('ModuleNotFoundError', `No module named '${name}'`, null,
      MODULE_HINTS[name.split('.')[0]] ?? 'Такого модуля в тренажёре нет. Доступны: transformers, math, random, json, time.')
  }

  async execTry(s, sc) {
    try {
      return await this.execBlock(s.body, sc)
    } catch (e) {
      if (!(e instanceof PyError) || e.pyType === 'KeyboardInterrupt') throw e
      if (e.line == null) e.line = s.line
      for (const h of s.handlers) {
        let ok = h.type === null
        if (!ok) {
          const tv = await this.ev(h.type, sc)
          const list = Array.isArray(tv) ? tv : [tv]
          ok = list.some(t => typeof t === 'function' && t.excName && excMatches(e.pyType, t.excName))
        }
        if (ok) {
          if (h.name) sc.vars.set(h.name, excFromError(e))
          this.excStack.push(e)
          try { return await this.execBlock(h.body, sc) } finally { this.excStack.pop() }
        }
      }
      throw e
    }
  }

  makeFunction(name, params, defaults, body, exprBody, closure) {
    const self = this
    const fn = async (args, kw) => {
      if (++self.depth > MAX_DEPTH) {
        self.depth--
        throw new PyError('RecursionError', 'maximum recursion depth exceeded', null, 'Функция вызывает сама себя без остановки. Добавь условие выхода (return).')
      }
      try {
        const local = new Scope(closure)
        const used = new Set()
        params.forEach((p, i) => {
          if (i < args.length) { local.vars.set(p.name, args[i]); used.add(p.name) }
        })
        if (args.length > params.length) {
          throw new PyError('TypeError', `${name}() takes ${params.length} positional argument${params.length === 1 ? '' : 's'} but ${args.length} were given`, null,
            'Передано больше аргументов, чем принимает функция.')
        }
        for (const k of Object.keys(kw)) {
          if (!params.some(p => p.name === k)) throw new PyError('TypeError', `${name}() got an unexpected keyword argument '${k}'`)
          if (used.has(k)) throw new PyError('TypeError', `${name}() got multiple values for argument '${k}'`)
          local.vars.set(k, kw[k])
          used.add(k)
        }
        params.forEach((p, i) => {
          if (!used.has(p.name)) {
            if (defaults[i] === UNSET) {
              throw new PyError('TypeError', `${name}() missing 1 required positional argument: '${p.name}'`, null,
                `Функции ${name} нужно передать значение для «${p.name}».`)
            }
            local.vars.set(p.name, defaults[i])
          }
        })
        if (exprBody) return await self.ev(exprBody, local)
        const sig = await self.execBlock(body, local)
        return sig && sig.k === 'return' ? sig.v : null
      } finally {
        self.depth--
      }
    }
    fn.pyName = name
    return fn
  }

  async assign(t, v, sc) {
    switch (t.t) {
      case 'Name': sc.vars.set(t.id, v); return
      case 'Sub': setItem(await this.ev(t.obj, sc), await this.evIndex(t.idx, sc), v); return
      case 'Attr': {
        const obj = await this.ev(t.obj, sc)
        if (obj instanceof PyObj) { obj.attrs[t.name] = v; return }
        throw new PyError('AttributeError', `'${typeName(obj)}' object has no attribute '${t.name}'`, t.line)
      }
      case 'Tuple': case 'List': {
        const items = toIter(v)
        if (items.length !== t.items.length) {
          throw new PyError('ValueError', items.length < t.items.length
            ? `not enough values to unpack (expected ${t.items.length}, got ${items.length})`
            : `too many values to unpack (expected ${t.items.length})`, t.line)
        }
        for (let i = 0; i < t.items.length; i++) await this.assign(t.items[i], items[i], sc)
        return
      }
      default: throw new PyError('SyntaxError', 'cannot assign to expression', t.line)
    }
  }

  /* ---------- выражения ---------- */
  async evIndex(idx, sc) {
    if (idx.t === 'Slice') {
      return {
        isSlice: true,
        lower: idx.lower ? await this.ev(idx.lower, sc) : null,
        upper: idx.upper ? await this.ev(idx.upper, sc) : null,
        step: idx.step ? await this.ev(idx.step, sc) : null,
      }
    }
    return this.ev(idx, sc)
  }

  async ev(n, sc) {
    switch (n.t) {
      case 'Num': case 'Str': case 'Const': return n.v
      case 'Name': {
        const v = sc.lookup(n.id)
        if (v === UNSET) throw this.nameError(n, sc)
        return v
      }
      case 'FStr': {
        let out = ''
        for (const p of n.parts) {
          if (p.lit !== undefined) { out += p.lit; continue }
          let v = await this.ev(p.expr, sc)
          if (p.conv === 'r') v = pyRepr(v)
          else if (p.conv === 's') v = pyStr(v)
          out += p.spec ? formatValue(v, p.spec) : pyStr(v)
        }
        return out
      }
      case 'List': {
        const out = []
        for (const x of n.items) out.push(await this.ev(x, sc))
        return out
      }
      case 'Tuple': {
        const out = []
        for (const x of n.items) out.push(await this.ev(x, sc))
        return mkTuple(out)
      }
      case 'Dict': {
        const d = new Map()
        for (const [k, v] of n.items) {
          const key = await this.ev(k, sc)
          if (Array.isArray(key) || key instanceof Map) throw new PyError('TypeError', `unhashable type: '${typeName(key)}'`, n.line, 'Ключом словаря может быть строка или число, но не список.')
          d.set(key, await this.ev(v, sc))
        }
        return d
      }
      case 'Comp': return this.evComp(n, sc)
      case 'BinOp': {
        const l = await this.ev(n.l, sc)
        const r = await this.ev(n.r, sc)
        try { return this.binop(n.op, l, r) } catch (e) { if (e instanceof PyError && e.line == null) e.line = n.line; throw e }
      }
      case 'Unary': {
        const v = await this.ev(n.e, sc)
        if (typeof v !== 'number' && typeof v !== 'boolean') throw new PyError('TypeError', `bad operand type for unary ${n.op}: '${typeName(v)}'`, n.line)
        return n.op === '-' ? -v : +v
      }
      case 'BoolOp': {
        const l = await this.ev(n.l, sc)
        if (n.op === 'and') return truthy(l) ? this.ev(n.r, sc) : l
        return truthy(l) ? l : this.ev(n.r, sc)
      }
      case 'Not': return !truthy(await this.ev(n.e, sc))
      case 'Compare': {
        let left = await this.ev(n.first, sc)
        for (const [op, rn] of n.ops) {
          const right = await this.ev(rn, sc)
          if (!this.cmp(op, left, right, n.line)) return false
          left = right
        }
        return true
      }
      case 'IfExp': return truthy(await this.ev(n.test, sc)) ? this.ev(n.body, sc) : this.ev(n.orelse, sc)
      case 'Lambda': {
        const defaults = []
        for (const p of n.params) defaults.push(p.def ? await this.ev(p.def, sc) : UNSET)
        return this.makeFunction('<lambda>', n.params, defaults, null, n.body, sc)
      }
      case 'Attr': {
        const obj = await this.ev(n.obj, sc)
        try { return this.getAttr(obj, n.name) } catch (e) { if (e instanceof PyError && e.line == null) e.line = n.line; throw e }
      }
      case 'Sub': {
        const obj = await this.ev(n.obj, sc)
        const idx = await this.evIndex(n.idx, sc)
        try { return getItem(obj, idx) } catch (e) { if (e instanceof PyError && e.line == null) e.line = n.line; throw e }
      }
      case 'Call': return this.evCall(n, sc)
      default:
        throw new PyError('SyntaxError', `неизвестное выражение ${n.t}`, n.line)
    }
  }

  async evCall(n, sc) {
    let fn
    if (n.fn.t === 'Attr') {
      const obj = await this.ev(n.fn.obj, sc)
      try { fn = this.getAttr(obj, n.fn.name) } catch (e) { if (e instanceof PyError && e.line == null) e.line = n.fn.line; throw e }
    } else {
      fn = await this.ev(n.fn, sc)
    }
    const args = []
    for (const a of n.args) {
      const v = await this.ev(a.e, sc)
      if (a.star) args.push(...toIter(v))
      else args.push(v)
    }
    const kw = noKw()
    for (const k of n.kws) {
      const v = await this.ev(k.e, sc)
      if (k.name === null) {
        if (!(v instanceof Map)) throw new PyError('TypeError', 'argument after ** must be a mapping', n.line)
        for (const [kk, vv] of v) kw[kk] = vv
      } else {
        kw[k.name] = v
      }
    }
    try {
      return await this.callValue(fn, args, kw)
    } catch (e) {
      if (e instanceof PyError && e.line == null) e.line = n.line
      throw e
    }
  }

  async evComp(n, sc) {
    const inner = new Scope(sc)
    const out = n.kind === 'dict' ? new Map() : []
    const loop = async (gi) => {
      if (gi === n.gens.length) {
        if (n.kind === 'dict') out.set(await this.ev(n.key, inner), await this.ev(n.elt, inner))
        else out.push(await this.ev(n.elt, inner))
        return
      }
      const g = n.gens[gi]
      const items = toIter(await this.ev(g.iter, inner))
      for (const it of items) {
        await this.tick()
        await this.assign(g.target, it, inner)
        let ok = true
        for (const c of g.ifs) if (!truthy(await this.ev(c, inner))) { ok = false; break }
        if (ok) await loop(gi + 1)
      }
    }
    await loop(0)
    return out
  }

  nameError(n, sc) {
    const name = n.id
    let hint
    if (NEEDS_IMPORT[name]) {
      hint = `Имя «${name}» нужно сначала импортировать: ${NEEDS_IMPORT[name]}`
    } else {
      const guess = suggest(name, sc.names())
      hint = guess
        ? `Возможно, ты имел в виду «${guess}»? Проверь опечатки и регистр букв: Python различает text и Text.`
        : `Переменная «${name}» не создана выше по коду. Сначала присвой ей значение: ${name} = ...`
    }
    return new PyError('NameError', `name '${name}' is not defined`, n.line, hint)
  }

  /* ---------- операторы ---------- */
  cmp(op, a, b, line) {
    try {
      switch (op) {
        case '==': return deepEq(a, b)
        case '!=': return !deepEq(a, b)
        case '<': return compare(a, b, '<') < 0
        case '>': return compare(a, b, '>') > 0
        case '<=': return compare(a, b, '<=') <= 0
        case '>=': return compare(a, b, '>=') >= 0
        case 'is': return a === b || (a === null && b === null)
        case 'is not': return !(a === b || (a === null && b === null))
        case 'in': return this.contains(b, a)
        case 'not in': return !this.contains(b, a)
        default: throw new PyError('SyntaxError', `оператор ${op} не поддерживается`)
      }
    } catch (e) {
      if (e instanceof PyError && e.line == null) e.line = line
      throw e
    }
  }

  contains(container, item) {
    if (typeof container === 'string') {
      if (typeof item !== 'string') throw new PyError('TypeError', `'in <string>' requires string as left operand, not ${typeName(item)}`)
      return container.includes(item)
    }
    if (Array.isArray(container)) return container.some(x => deepEq(x, item))
    if (container instanceof Map) return container.has(item)
    throw new PyError('TypeError', `argument of type '${typeName(container)}' is not iterable`)
  }

  binop(op, a, b) {
    const ta = typeof a
    const tb = typeof b
    const numeric = (ta === 'number' || ta === 'boolean') && (tb === 'number' || tb === 'boolean')
    switch (op) {
      case '+':
        if (numeric) return Number(a) + Number(b)
        if (ta === 'string' && tb === 'string') return a + b
        if (Array.isArray(a) && Array.isArray(b) && isTuple(a) === isTuple(b)) return isTuple(a) ? mkTuple([...a, ...b]) : [...a, ...b]
        if (ta === 'string') {
          throw new PyError('TypeError', `can only concatenate str (not "${typeName(b)}") to str`, null,
            'Нельзя склеить строку с не-строкой. Преобразуй: str(x), либо используй f-строку: f"текст {x}".')
        }
        break
      case '-':
        if (numeric) return Number(a) - Number(b)
        break
      case '*':
        if (numeric) return Number(a) * Number(b)
        if (ta === 'string' && Number.isInteger(b)) return b > 0 ? a.repeat(b) : ''
        if (tb === 'string' && Number.isInteger(a)) return a > 0 ? b.repeat(a) : ''
        if (Array.isArray(a) && !isTuple(a) && Number.isInteger(b)) return b > 0 ? Array.from({ length: b }, () => a).flat() : []
        break
      case '/':
        if (numeric) {
          if (Number(b) === 0) throw new PyError('ZeroDivisionError', 'division by zero', null, 'На ноль делить нельзя. Проверь знаменатель: if x != 0: ...')
          return Number(a) / Number(b)
        }
        break
      case '//':
        if (numeric) {
          if (Number(b) === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero', null, 'На ноль делить нельзя.')
          return Math.floor(Number(a) / Number(b))
        }
        break
      case '%':
        if (numeric) {
          if (Number(b) === 0) throw new PyError('ZeroDivisionError', 'integer modulo by zero', null, 'На ноль делить нельзя.')
          const m = Number(a) % Number(b)
          return m !== 0 && (m < 0) !== (Number(b) < 0) ? m + Number(b) : m
        }
        if (ta === 'string') throw new PyError('TypeError', 'форматирование строк через % не поддерживается', null, 'Используй f-строку: f"значение {x:.2f}".')
        break
      case '**':
        if (numeric) return Number(a) ** Number(b)
        break
      default:
    }
    throw new PyError('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`, null,
      'Эти типы нельзя использовать вместе в этой операции. Проверь типы: print(type(x)).')
  }
}

/** Запуск программы. Никогда не бросает: ошибки возвращаются в поле error. */
export async function runProgram(source, io) {
  const t0 = performance.now()
  const finish = (error) => ({ ok: !error, ms: Math.round(performance.now() - t0), error })
  const asError = (e) => {
    if (e instanceof PyError) {
      return { type: e.pyType, message: e.message, line: e.line, hint: e.hint }
    }
    if (e instanceof RangeError && /call stack/i.test(e.message)) {
      return { type: 'RecursionError', message: 'maximum recursion depth exceeded', line: null, hint: 'Слишком глубокая вложенность вызовов.' }
    }
    return { type: 'InternalError', message: e && e.message ? e.message : String(e), line: null, hint: 'Это ошибка самого тренажёра, а не твоей программы. Попробуй упростить код.' }
  }
  let tree
  try {
    tree = parse(source)
  } catch (e) {
    return finish(asError(e))
  }
  const interp = new Interp(io)
  try {
    await interp.run(tree)
    return finish(null)
  } catch (e) {
    return finish(asError(e))
  }
}

export { parse }
