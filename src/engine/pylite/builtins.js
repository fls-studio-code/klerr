/**
 * Встроенные функции, методы строк/списков/словарей и модули мини-Python
 * (transformers, math, random, json, time).
 */
import { PyError } from './errors.js'
import {
  PyObj, mkTuple, isTuple, typeName, truthy, pyStr, pyRepr, formatValue, pyFixed,
  deepEq, compare, fromJS, toJS, jsonDumps,
} from './values.js'

/* ---------- общие помощники ---------- */
export function toIter(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return [...v]
  if (v instanceof Map) return [...v.keys()]
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`, null,
    'Перебирать можно списки, строки и словари. Число перебрать нельзя: для цикла по числам используй range(n).')
}

function needStr(v, what) {
  if (typeof v !== 'string') throw new PyError('TypeError', `${what} must be str, not ${typeName(v)}`)
  return v
}

function needInt(v, what) {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new PyError('TypeError', `${what} must be an integer, not ${typeName(v)}`)
  }
  return v
}

function bankers(x) {
  const f = Math.floor(x)
  const d = x - f
  if (d < 0.5) return f
  if (d > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

/* ---------- строки ---------- */
function stripChars(s, chars, side) {
  const set = chars == null ? null : new Set([...chars])
  const isStrip = ch => (set ? set.has(ch) : /\s/.test(ch))
  const arr = [...s]
  let a = 0
  let b = arr.length
  if (side !== 'right') while (a < b && isStrip(arr[a])) a++
  if (side !== 'left') while (b > a && isStrip(arr[b - 1])) b--
  return arr.slice(a, b).join('')
}

function pySplit(s, sep, max) {
  if (sep == null) {
    if (max < 0) { const t = s.trim(); return t ? t.split(/\s+/) : [] }
    const parts = []
    let rest = s.replace(/^\s+/, '')
    while (rest && parts.length < max) {
      const m = /\s+/.exec(rest)
      if (!m) break
      parts.push(rest.slice(0, m.index))
      rest = rest.slice(m.index + m[0].length)
    }
    if (rest) parts.push(rest)
    return parts
  }
  if (sep === '') throw new PyError('ValueError', 'empty separator')
  if (max < 0) return s.split(sep)
  const parts = []
  let rest = s
  while (parts.length < max) {
    const i = rest.indexOf(sep)
    if (i < 0) break
    parts.push(rest.slice(0, i))
    rest = rest.slice(i + sep.length)
  }
  parts.push(rest)
  return parts
}

function strFormat(s, args, kw) {
  let auto = 0
  return s.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (m, field) => {
    if (m === '{{') return '{'
    if (m === '}}') return '}'
    let spec = ''
    let conv = null
    let name = field
    const ci = field.indexOf(':')
    if (ci >= 0) { name = field.slice(0, ci); spec = field.slice(ci + 1) }
    const bi = name.indexOf('!')
    if (bi >= 0) { conv = name.slice(bi + 1); name = name.slice(0, bi) }
    let v
    if (name === '') {
      if (auto >= args.length) throw new PyError('IndexError', 'Replacement index ' + auto + ' out of range for positional args tuple')
      v = args[auto++]
    } else if (/^\d+$/.test(name)) {
      if (+name >= args.length) throw new PyError('IndexError', `Replacement index ${name} out of range for positional args tuple`)
      v = args[+name]
    } else {
      if (!(name in kw)) throw new PyError('KeyError', pyRepr(name))
      v = kw[name]
    }
    if (conv === 'r') v = pyRepr(v)
    return formatValue(v, spec)
  })
}

const STR_METHODS = {
  upper: s => s.toUpperCase(),
  lower: s => s.toLowerCase(),
  casefold: s => s.toLowerCase(),
  title: s => s.toLowerCase().replace(/(^|[^\p{L}'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase()),
  capitalize: s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  strip: (s, a) => stripChars(s, a[0], 'both'),
  lstrip: (s, a) => stripChars(s, a[0], 'left'),
  rstrip: (s, a) => stripChars(s, a[0], 'right'),
  split: (s, a, kw) => pySplit(s, a[0] ?? kw.sep ?? null, a[1] ?? kw.maxsplit ?? -1),
  splitlines: s => (s === '' ? [] : s.replace(/\r?\n$/, '').split(/\r?\n/)),
  join: (s, a) => {
    const items = toIter(a[0])
    items.forEach((x, i) => {
      if (typeof x !== 'string') throw new PyError('TypeError', `sequence item ${i}: expected str instance, ${typeName(x)} found`, null, 'join склеивает только строки. Преобразуй элементы: " ".join(str(x) for x in список).')
    })
    return items.join(s)
  },
  replace: (s, a) => {
    const [old, nw, count = -1] = a
    needStr(old, 'replace() argument 1'); needStr(nw, 'replace() argument 2')
    if (count < 0) return s.split(old).join(nw)
    let out = s
    let n = 0
    let idx = 0
    let res = ''
    while (n < count) {
      const i = out.indexOf(old, idx)
      if (i < 0) break
      res += out.slice(idx, i) + nw
      idx = i + old.length
      n++
    }
    return res + out.slice(idx)
  },
  startswith: (s, a) => (Array.isArray(a[0]) ? a[0].some(p => s.startsWith(p)) : s.startsWith(needStr(a[0], 'startswith first arg'))),
  endswith: (s, a) => (Array.isArray(a[0]) ? a[0].some(p => s.endsWith(p)) : s.endsWith(needStr(a[0], 'endswith first arg'))),
  find: (s, a) => s.indexOf(needStr(a[0], 'find() argument')),
  rfind: (s, a) => s.lastIndexOf(needStr(a[0], 'rfind() argument')),
  index: (s, a) => {
    const i = s.indexOf(needStr(a[0], 'index() argument'))
    if (i < 0) throw new PyError('ValueError', 'substring not found')
    return i
  },
  count: (s, a) => (a[0] === '' ? [...s].length + 1 : s.split(needStr(a[0], 'count() argument')).length - 1),
  isdigit: s => /^\d+$/.test(s),
  isalpha: s => /^\p{L}+$/u.test(s),
  isalnum: s => /^[\p{L}\p{N}]+$/u.test(s),
  isspace: s => /^\s+$/.test(s),
  isupper: s => /\p{L}/u.test(s) && s === s.toUpperCase(),
  islower: s => /\p{L}/u.test(s) && s === s.toLowerCase(),
  zfill: (s, a) => (s.startsWith('-') ? '-' + s.slice(1).padStart(a[0] - 1, '0') : s.padStart(a[0], '0')),
  center: (s, a) => {
    const w = a[0]
    const f = a[1] ?? ' '
    const gap = Math.max(0, w - [...s].length)
    const l = Math.floor(gap / 2) + (gap % 2 && w % 2 ? 1 : 0)
    return f.repeat(l) + s + f.repeat(gap - l)
  },
  ljust: (s, a) => s.padEnd(a[0], a[1] ?? ' '),
  rjust: (s, a) => s.padStart(a[0], a[1] ?? ' '),
  removeprefix: (s, a) => (s.startsWith(a[0]) ? s.slice(a[0].length) : s),
  removesuffix: (s, a) => (a[0] && s.endsWith(a[0]) ? s.slice(0, -a[0].length) : s),
  format: (s, a, kw) => strFormat(s, a, kw),
}

/* ---------- списки ---------- */
function immutable(obj, name) {
  if (isTuple(obj)) throw new PyError('AttributeError', `'tuple' object has no attribute '${name}'`, null, 'Кортеж (tuple) нельзя менять. Преобразуй его в список: list(x).')
}

function normIndex(i, len, what = 'list') {
  needInt(i, `${what} indices`)
  const k = i < 0 ? i + len : i
  if (k < 0 || k >= len) throw new PyError('IndexError', `${what} index out of range`, null, `Индекс ${i} выходит за границы: в ${what === 'list' ? 'списке' : 'коллекции'} ${len} элементов (индексы с 0 до ${Math.max(0, len - 1)}).`)
  return k
}

export async function sortValues(arr, key, reverse, call) {
  const keys = []
  for (const x of arr) keys.push(key == null ? x : await call(key, [x], Object.create(null)))
  const idx = arr.map((_, i) => i)
  idx.sort((i, j) => (reverse ? -compare(keys[i], keys[j]) : compare(keys[i], keys[j])))
  return idx.map(i => arr[i])
}

function listMethods(call) {
  return {
    append: (l, a) => { immutable(l, 'append'); l.push(a[0]); return null },
    extend: (l, a) => { immutable(l, 'extend'); l.push(...toIter(a[0])); return null },
    insert: (l, a) => { immutable(l, 'insert'); l.splice(Math.max(0, a[0] < 0 ? l.length + a[0] : a[0]), 0, a[1]); return null },
    pop: (l, a) => {
      immutable(l, 'pop')
      if (!l.length) throw new PyError('IndexError', 'pop from empty list')
      return l.splice(a.length ? normIndex(a[0], l.length) : l.length - 1, 1)[0]
    },
    remove: (l, a) => {
      immutable(l, 'remove')
      const i = l.findIndex(x => deepEq(x, a[0]))
      if (i < 0) throw new PyError('ValueError', 'list.remove(x): x not in list')
      l.splice(i, 1)
      return null
    },
    index: (l, a) => {
      const i = l.findIndex(x => deepEq(x, a[0]))
      if (i < 0) throw new PyError('ValueError', `${pyRepr(a[0])} is not in list`)
      return i
    },
    count: (l, a) => l.filter(x => deepEq(x, a[0])).length,
    sort: async (l, a, kw) => {
      immutable(l, 'sort')
      const sorted = await sortValues(l, kw.key ?? null, truthy(kw.reverse), call)
      l.splice(0, l.length, ...sorted)
      return null
    },
    reverse: (l) => { immutable(l, 'reverse'); l.reverse(); return null },
    copy: l => [...l],
    clear: (l) => { immutable(l, 'clear'); l.length = 0; return null },
  }
}

/* ---------- словари ---------- */
const DICT_METHODS = {
  get: (d, a) => (d.has(a[0]) ? d.get(a[0]) : (a[1] ?? null)),
  keys: d => [...d.keys()],
  values: d => [...d.values()],
  items: d => [...d].map(([k, v]) => mkTuple([k, v])),
  pop: (d, a) => {
    if (d.has(a[0])) { const v = d.get(a[0]); d.delete(a[0]); return v }
    if (a.length > 1) return a[1]
    throw new PyError('KeyError', pyRepr(a[0]))
  },
  update: (d, a, kw) => {
    if (a[0] instanceof Map) for (const [k, v] of a[0]) d.set(k, v)
    else if (Array.isArray(a[0])) for (const p of a[0]) d.set(p[0], p[1])
    for (const k of Object.keys(kw)) d.set(k, kw[k])
    return null
  },
  setdefault: (d, a) => { if (!d.has(a[0])) d.set(a[0], a[1] ?? null); return d.get(a[0]) },
  copy: d => new Map(d),
  clear: (d) => { d.clear(); return null },
}

/** Атрибут значения: метод строки/списка/словаря или атрибут объекта. */
export function makeGetAttr(call) {
  const LIST = listMethods(call)
  const bind = (table, obj, name) => {
    const m = table[name]
    if (!m) return undefined
    const f = (a, kw) => m(obj, a, kw)
    f.pyName = name
    return f
  }
  return function getAttr(obj, name) {
    let r
    if (typeof obj === 'string') r = bind(STR_METHODS, obj, name)
    else if (Array.isArray(obj)) r = bind(LIST, obj, name)
    else if (obj instanceof Map) r = bind(DICT_METHODS, obj, name)
    else if (obj instanceof PyObj) r = Object.prototype.hasOwnProperty.call(obj.attrs, name) ? obj.attrs[name] : undefined
    else if (typeof obj === 'function') {
      if (obj.attrs && Object.prototype.hasOwnProperty.call(obj.attrs, name)) r = obj.attrs[name]
      else if (name === '__name__') r = obj.pyName ?? 'function'
    }
    if (r === undefined) {
      const tn = typeName(obj)
      let hint = ''
      if (tn === 'list' && ['lower', 'upper', 'split', 'strip'].includes(name)) hint = 'Это список, а не строка. Возьми элемент списка: x[0].' + name + '()'
      else if (tn === 'dict' && name === 'append') hint = 'У словаря нет append. Добавь ключ: d["ключ"] = значение.'
      else if (tn === 'str' && name === 'append') hint = 'Строку нельзя менять через append. Склей строки: s = s + "..."'
      throw new PyError('AttributeError', `'${tn}' object has no attribute '${name}'`, null, hint)
    }
    return r
  }
}

/* ---------- индексы и срезы ---------- */
export function sliceIndices(len, lo, up, st) {
  const step = st ?? 1
  if (step === 0) throw new PyError('ValueError', 'slice step cannot be zero')
  const idx = []
  if (step > 0) {
    const start = lo == null ? 0 : (lo < 0 ? Math.max(lo + len, 0) : Math.min(lo, len))
    const stop = up == null ? len : (up < 0 ? Math.max(up + len, 0) : Math.min(up, len))
    for (let i = start; i < stop; i += step) idx.push(i)
  } else {
    const start = lo == null ? len - 1 : (lo < 0 ? Math.max(lo + len, -1) : Math.min(lo, len - 1))
    const stop = up == null ? -1 : (up < 0 ? Math.max(up + len, -1) : Math.min(up, len - 1))
    for (let i = start; i > stop; i += step) idx.push(i)
  }
  return idx
}

export function getItem(obj, idx) {
  if (idx !== null && typeof idx === 'object' && idx.isSlice === true) {
    if (typeof obj === 'string') {
      const chars = [...obj]
      return sliceIndices(chars.length, idx.lower, idx.upper, idx.step).map(i => chars[i]).join('')
    }
    if (Array.isArray(obj)) {
      const r = sliceIndices(obj.length, idx.lower, idx.upper, idx.step).map(i => obj[i])
      return isTuple(obj) ? mkTuple(r) : r
    }
    throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`)
  }
  if (Array.isArray(obj)) return obj[normIndex(idx, obj.length, isTuple(obj) ? 'tuple' : 'list')]
  if (typeof obj === 'string') {
    const chars = [...obj]
    return chars[normIndex(idx, chars.length, 'string')]
  }
  if (obj instanceof Map) {
    if (!obj.has(idx)) {
      throw new PyError('KeyError', pyRepr(idx), null,
        `В словаре нет ключа ${pyRepr(idx)}. Доступные ключи: ${[...obj.keys()].map(k => pyRepr(k)).join(', ') || '(пусто)'}.`)
    }
    return obj.get(idx)
  }
  throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`, null,
    'Квадратные скобки работают со списками, строками и словарями.')
}

export function setItem(obj, idx, value) {
  if (Array.isArray(obj) && !isTuple(obj)) {
    obj[normIndex(idx, obj.length)] = value
  } else if (obj instanceof Map) {
    obj.set(idx, value)
  } else {
    throw new PyError('TypeError', `'${typeName(obj)}' object does not support item assignment`, null,
      isTuple(obj) ? 'Кортеж нельзя менять. Преобразуй его в список: list(x).' : 'Строки менять по индексу нельзя: собери новую строку.')
  }
}

/* ---------- исключения ---------- */
const EXC_PARENT = {
  Exception: null,
  ArithmeticError: 'Exception',
  LookupError: 'Exception',
  ZeroDivisionError: 'ArithmeticError',
  KeyError: 'LookupError',
  IndexError: 'LookupError',
  ValueError: 'Exception',
  TypeError: 'Exception',
  NameError: 'Exception',
  AttributeError: 'Exception',
  RuntimeError: 'Exception',
  RecursionError: 'RuntimeError',
  NotImplementedError: 'RuntimeError',
  ImportError: 'Exception',
  ModuleNotFoundError: 'ImportError',
  AssertionError: 'Exception',
  OSError: 'Exception',
  MemoryError: 'Exception',
  StopIteration: 'Exception',
  SyntaxError: 'Exception',
  IndentationError: 'SyntaxError',
}

export function excMatches(type, handler) {
  for (let t = type; t; t = EXC_PARENT[t]) if (t === handler) return true
  return false
}

export function makeExc(name, args) {
  const obj = new PyObj(name, { args: mkTuple([...args]) }, () => (args.length === 0 ? '' : args.length === 1 ? pyStr(args[0]) : pyRepr(mkTuple([...args]))))
  obj.isExc = true
  return obj
}

export function excFromError(e) {
  const o = new PyObj(e.pyType, { args: mkTuple([e.message]) }, () => e.message)
  o.isExc = true
  return o
}

/* ---------- генератор случайных чисел (mulberry32) ---------- */
export function createRng(seed = Math.floor(Math.random() * 2 ** 32)) {
  let s = seed >>> 0
  const rng = {
    seed(n) { s = (Number(n) || 0) >>> 0 },
    next() {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
  return rng
}

/* ---------- встроенные функции ---------- */
const TYPE_CHECK = {
  str: v => typeof v === 'string',
  int: v => typeof v === 'number' && Number.isInteger(v),
  float: v => typeof v === 'number',
  bool: v => typeof v === 'boolean',
  list: v => Array.isArray(v) && !isTuple(v),
  tuple: v => isTuple(v),
  dict: v => v instanceof Map,
}

const delay = ms => new Promise(r => setTimeout(r, ms))

export function createBuiltins(ctx) {
  const { call, write } = ctx
  const B = new Map()
  const def = (name, fn, extra) => { fn.pyName = name; if (extra) Object.assign(fn, extra); B.set(name, fn); return fn }
  const noKw = Object.create(null)

  def('print', (a, kw) => {
    const sep = kw.sep == null ? ' ' : pyStr(kw.sep)
    const end = kw.end == null ? '\n' : pyStr(kw.end)
    write(a.map(pyStr).join(sep) + end)
    return null
  })

  def('len', (a) => {
    const v = a[0]
    if (typeof v === 'string') return [...v].length
    if (Array.isArray(v)) return v.length
    if (v instanceof Map) return v.size
    throw new PyError('TypeError', `object of type '${typeName(v)}' has no len()`, null, 'len() работает со строками, списками и словарями.')
  })

  def('range', (a) => {
    a.forEach(x => needInt(x, 'range() argument'))
    const [start, stop, step] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1]
    if (a.length === 0) throw new PyError('TypeError', 'range expected at least 1 argument, got 0')
    if (step === 0) throw new PyError('ValueError', 'range() arg 3 must not be zero')
    const n = Math.max(0, Math.ceil((stop - start) / step))
    if (n > 1_000_000) throw new PyError('MemoryError', 'range слишком большой', null, 'В тренажёре диапазон ограничен миллионом чисел.')
    return Array.from({ length: n }, (_, i) => start + i * step)
  })

  const mkType = (name, fn) => def(name, fn, { isType: name, pyKind: 'type', pyRepr: `<class '${name}'>` })

  mkType('str', a => (a.length ? pyStr(a[0]) : ''))
  mkType('bool', a => (a.length ? truthy(a[0]) : false))
  mkType('int', (a) => {
    const x = a[0]
    if (a.length === 0) return 0
    if (typeof x === 'boolean') return Number(x)
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new PyError('ValueError', 'cannot convert float NaN or infinity to integer')
      return Math.trunc(x)
    }
    if (typeof x === 'string') {
      const base = a[1] ?? 10
      const t = x.trim().replace(/_/g, '')
      const ok = base === 10 ? /^[+-]?\d+$/.test(t) : t !== '' && !Number.isNaN(parseInt(t, base))
      if (!ok) throw new PyError('ValueError', `invalid literal for int() with base ${base}: ${pyRepr(x)}`, null, 'int() принимает строку только из цифр, например "42". Для дробного числа сначала float().')
      return parseInt(t, base)
    }
    throw new PyError('TypeError', `int() argument must be a string or a number, not '${typeName(x)}'`)
  })
  mkType('float', (a) => {
    const x = a[0]
    if (a.length === 0) return 0
    if (typeof x === 'number' || typeof x === 'boolean') return Number(x)
    if (typeof x === 'string') {
      const t = x.trim().toLowerCase().replace(/_/g, '')
      if (t === 'nan') return NaN
      if (/^[+-]?inf(inity)?$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity
      if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t)) throw new PyError('ValueError', `could not convert string to float: ${pyRepr(x)}`, null, 'float() принимает строку вида "3.14".')
      return Number(t)
    }
    throw new PyError('TypeError', `float() argument must be a string or a number, not '${typeName(x)}'`)
  })
  mkType('list', a => (a.length ? [...toIter(a[0])] : []))
  mkType('tuple', a => mkTuple(a.length ? [...toIter(a[0])] : []))
  mkType('dict', (a, kw) => {
    const d = new Map()
    if (a[0] instanceof Map) for (const [k, v] of a[0]) d.set(k, v)
    else if (Array.isArray(a[0])) for (const p of a[0]) d.set(p[0], p[1])
    for (const k of Object.keys(kw)) d.set(k, kw[k])
    return d
  })

  def('repr', a => pyRepr(a[0]))
  def('format', a => formatValue(a[0], a[1] ?? ''))
  def('abs', (a) => {
    if (typeof a[0] !== 'number') throw new PyError('TypeError', `bad operand type for abs(): '${typeName(a[0])}'`)
    return Math.abs(a[0])
  })
  def('round', (a) => {
    const x = a[0]
    if (typeof x !== 'number' && typeof x !== 'boolean') throw new PyError('TypeError', `type ${typeName(x)} doesn't define __round__ method`, null, 'round() работает с числами. Строку сначала преобразуй: float(...).')
    const nd = a[1]
    if (nd === undefined || nd === null) return bankers(Number(x))
    needInt(nd, 'round() ndigits')
    if (nd >= 0) return Number(pyFixed(Number(x), Math.min(nd, 100)))
    const f = 10 ** -nd
    return bankers(x / f) * f
  })
  def('pow', a => a[0] ** a[1])
  def('divmod', (a) => {
    if (a[1] === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero')
    const q = Math.floor(a[0] / a[1])
    return mkTuple([q, a[0] - q * a[1]])
  })
  def('ord', a => a[0].codePointAt(0))
  def('chr', a => String.fromCodePoint(a[0]))
  def('callable', a => typeof a[0] === 'function')
  def('type', a => new PyObj('type', { __name__: typeName(a[0]) }, () => `<class '${typeName(a[0])}'>`))

  def('isinstance', (a) => {
    const [v, cls] = a
    const check = c => {
      if (typeof c === 'function' && c.isType) return TYPE_CHECK[c.isType](v)
      throw new PyError('TypeError', 'isinstance() arg 2 must be a type or tuple of types', null, 'Поддерживаются str, int, float, bool, list, tuple, dict.')
    }
    return Array.isArray(cls) ? cls.some(check) : check(cls)
  })

  def('sum', async (a, kw) => {
    let acc = a[1] ?? kw.start ?? 0
    for (const x of toIter(a[0])) {
      if (typeof x !== 'number' && typeof x !== 'boolean') throw new PyError('TypeError', `unsupported operand type(s) for +: '${typeName(acc)}' and '${typeName(x)}'`, null, 'sum() складывает только числа.')
      acc += Number(x)
    }
    return acc
  })

  const extreme = (name, sign) => def(name, async (a, kw) => {
    const items = a.length === 1 ? toIter(a[0]) : a
    if (!items.length) {
      if ('default' in kw) return kw.default
      throw new PyError('ValueError', `${name}() arg is an empty sequence`, null, 'Список пуст: нечего сравнивать. Проверь данные или задай default=...')
    }
    let best = items[0]
    let bestKey = kw.key ? await call(kw.key, [best], noKw) : best
    for (let i = 1; i < items.length; i++) {
      const k = kw.key ? await call(kw.key, [items[i]], noKw) : items[i]
      if (compare(k, bestKey, sign > 0 ? '>' : '<') * sign > 0) { best = items[i]; bestKey = k }
    }
    return best
  })
  extreme('max', 1)
  extreme('min', -1)

  def('sorted', (a, kw) => sortValues([...toIter(a[0])], kw.key ?? null, truthy(kw.reverse), call))
  def('reversed', a => [...toIter(a[0])].reverse())
  def('enumerate', (a, kw) => {
    const start = a[1] ?? kw.start ?? 0
    return toIter(a[0]).map((x, i) => mkTuple([i + start, x]))
  })
  def('zip', (a) => {
    const lists = a.map(toIter)
    const n = lists.length ? Math.min(...lists.map(l => l.length)) : 0
    return Array.from({ length: n }, (_, i) => mkTuple(lists.map(l => l[i])))
  })
  def('map', async (a) => {
    const lists = a.slice(1).map(toIter)
    const n = Math.min(...lists.map(l => l.length))
    const out = []
    for (let i = 0; i < n; i++) out.push(await call(a[0], lists.map(l => l[i]), noKw))
    return out
  })
  def('filter', async (a) => {
    const out = []
    for (const x of toIter(a[1])) {
      const keep = a[0] === null ? truthy(x) : truthy(await call(a[0], [x], noKw))
      if (keep) out.push(x)
    }
    return out
  })
  def('any', a => toIter(a[0]).some(truthy))
  def('all', a => toIter(a[0]).every(truthy))
  def('input', () => {
    throw new PyError('RuntimeError', 'input() не поддерживается', null, 'В тренажёре нет клавиатурного ввода: запиши нужный текст прямо в переменную, например text = "I love it".')
  })
  def('open', () => {
    throw new PyError('RuntimeError', 'open() не поддерживается', null, 'У программы в браузере нет доступа к файлам. Данные записывай прямо в код.')
  })

  // исключения как классы
  for (const name of Object.keys(EXC_PARENT)) {
    def(name, a => makeExc(name, a), { excName: name, pyKind: 'type', pyRepr: `<class '${name}'>` })
  }

  return B
}

/* ---------- модули ---------- */
export function createModules(ctx) {
  const { ml, rng, cancel } = ctx
  const M = {}
  const fn = (name, f) => { f.pyName = name; return f }
  const num = (name, v) => {
    if (typeof v !== 'number') throw new PyError('TypeError', `${name}() argument must be a real number, not ${typeName(v)}`)
    return v
  }

  /* --- transformers --- */
  const wrapML = async (p) => {
    try { return await p } catch (e) {
      if (e instanceof PyError) throw e
      throw new PyError('RuntimeError', e && e.message ? e.message : String(e), null, 'Если это связано с загрузкой модели, проверь интернет и повтори запуск.')
    }
  }

  const pipeline = fn('pipeline', async (a, kw) => {
    const task = a[0] ?? kw.task
    if (typeof task !== 'string') {
      throw new PyError('TypeError', "pipeline() missing 1 required positional argument: 'task'", null,
        'Первым аргументом укажи задачу: pipeline("sentiment-analysis"), pipeline("text-generation") или pipeline("summarization").')
    }
    const model = a[1] ?? kw.model ?? null
    const opts = { ...kw }
    delete opts.task
    delete opts.model
    const impl = await wrapML(ml.pipeline(task, model == null ? null : String(model), toJS(fromJS(opts)) ?? {}))
    const pipe = async (args, k) => {
      if (!args.length && !Object.keys(k).length) {
        throw new PyError('TypeError', 'pipeline() вызван без входных данных', null, 'Передай текст: pipe("some text").')
      }
      const out = await wrapML(impl(toJS(args[0]), toJS(fromJS(k)) ?? {}, args.slice(1).map(toJS)))
      return fromJS(out)
    }
    pipe.pyName = `${task}-pipeline`
    pipe.pyRepr = `<pipeline ${task}>`
    pipe.attrs = { task, model: model == null ? null : String(model) }
    return pipe
  })

  const setSeed = fn('set_seed', (a) => {
    needInt(a[0], 'seed')
    ml.setSeed(a[0])
    rng.seed(a[0])
    return null
  })

  const AutoTokenizer = new PyObj('AutoTokenizer', {
    from_pretrained: fn('from_pretrained', async (a) => {
      if (typeof a[0] !== 'string') throw new PyError('TypeError', 'from_pretrained() ожидает название модели строкой', null, 'Например: AutoTokenizer.from_pretrained("gpt2")')
      const name = a[0]
      const tk = await wrapML(ml.tokenizer(name))
      const attrs = {
        name_or_path: name,
        tokenize: fn('tokenize', async (args) => fromJS(await wrapML(tk.tokenize(needStr(args[0], 'tokenize() text'))))),
        encode: fn('encode', async (args) => fromJS(await wrapML(tk.encode(needStr(args[0], 'encode() text'))))),
      }
      return new PyObj('PreTrainedTokenizer', attrs, () => `<tokenizer ${name}>`)
    }),
  }, () => '<AutoTokenizer>')

  M.transformers = new PyObj('module', { pipeline, set_seed: setSeed, AutoTokenizer }, () => "<module 'transformers'>")

  /* --- math --- */
  const m1 = (name, f) => fn(name, a => f(num(name, a[0])))
  M.math = new PyObj('module', {
    pi: Math.PI,
    e: Math.E,
    inf: Infinity,
    nan: NaN,
    sqrt: fn('sqrt', (a) => {
      if (num('sqrt', a[0]) < 0) throw new PyError('ValueError', 'math domain error', null, 'Квадратный корень из отрицательного числа не определён.')
      return Math.sqrt(a[0])
    }),
    floor: m1('floor', Math.floor),
    ceil: m1('ceil', Math.ceil),
    trunc: m1('trunc', Math.trunc),
    fabs: m1('fabs', Math.abs),
    exp: m1('exp', Math.exp),
    sin: m1('sin', Math.sin),
    cos: m1('cos', Math.cos),
    tan: m1('tan', Math.tan),
    log: fn('log', (a) => {
      if (num('log', a[0]) <= 0) throw new PyError('ValueError', 'math domain error', null, 'Логарифм определён только для положительных чисел.')
      return a[1] === undefined ? Math.log(a[0]) : Math.log(a[0]) / Math.log(a[1])
    }),
    log10: m1('log10', Math.log10),
    pow: fn('pow', a => num('pow', a[0]) ** num('pow', a[1])),
  }, () => "<module 'math'>")

  /* --- random --- */
  const seq = (name, v) => {
    if (!Array.isArray(v) && typeof v !== 'string') throw new PyError('TypeError', `random.${name}() ожидает список или строку`)
    return typeof v === 'string' ? [...v] : v
  }
  M.random = new PyObj('module', {
    seed: fn('seed', (a) => { rng.seed(a[0] ?? 0); return null }),
    random: fn('random', () => rng.next()),
    randint: fn('randint', a => a[0] + Math.floor(rng.next() * (a[1] - a[0] + 1))),
    uniform: fn('uniform', a => a[0] + rng.next() * (a[1] - a[0])),
    choice: fn('choice', (a) => {
      const s = seq('choice', a[0])
      if (!s.length) throw new PyError('IndexError', 'Cannot choose from an empty sequence')
      return s[Math.floor(rng.next() * s.length)]
    }),
    shuffle: fn('shuffle', (a) => {
      const l = a[0]
      for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]]
      }
      return null
    }),
    sample: fn('sample', (a) => {
      const s = [...seq('sample', a[0])]
      for (let i = s.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [s[i], s[j]] = [s[j], s[i]]
      }
      return s.slice(0, a[1])
    }),
  }, () => "<module 'random'>")

  /* --- json --- */
  M.json = new PyObj('module', {
    dumps: fn('dumps', (a, kw) => jsonDumps(a[0], kw.indent == null ? null : Number(kw.indent), kw.ensure_ascii === undefined ? true : truthy(kw.ensure_ascii))),
    loads: fn('loads', (a) => {
      try { return fromJS(JSON.parse(needStr(a[0], 'loads() argument'))) } catch (e) {
        if (e instanceof PyError) throw e
        throw new PyError('ValueError', 'Expecting valid JSON: ' + e.message, null, 'Проверь, что строка это корректный JSON (двойные кавычки у ключей).')
      }
    }),
  }, () => "<module 'json'>")

  /* --- time --- */
  M.time = new PyObj('module', {
    time: fn('time', () => Date.now() / 1000),
    perf_counter: fn('perf_counter', () => performance.now() / 1000),
    sleep: fn('sleep', async (a) => {
      const ms = Math.min(Math.max(num('sleep', a[0]), 0), 5) * 1000
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (cancel.value) break
        await delay(Math.min(50, end - Date.now()))
      }
      return null
    }),
  }, () => "<module 'time'>")

  return M
}

export const MODULE_HINTS = {
  torch: 'В тренажёре нет PyTorch: модели запускаются прямо в браузере. Достаточно from transformers import pipeline.',
  tensorflow: 'В тренажёре нет TensorFlow: модели запускаются прямо в браузере. Достаточно from transformers import pipeline.',
  keras: 'В тренажёре нет Keras и tf-keras: они нужны только для настоящего Python. Здесь достаточно from transformers import pipeline.',
  numpy: 'NumPy недоступен в браузерном тренажёре. Для математики есть модуль math.',
  pandas: 'Pandas недоступен в браузерном тренажёре. Для таблиц используй списки и словари.',
  requests: 'Сетевые запросы в тренажёре недоступны.',
}

