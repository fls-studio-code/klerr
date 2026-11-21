/**
 * Klerr — прослойка диалекта: T-SQL (Microsoft SQL Server) поверх SQLite.
 *
 * Курс построен на SQL Server и SSMS, а в браузере работает SQLite (sql.js).
 * Движок (tsql.js) переводит базовый синтаксис; здесь — всё, где SQLite
 * ведёт себя иначе, чем SQL Server, и что нужно в уроках:
 *
 *  • схемы и составные имена: CREATE SCHEMA, Person.Person, [dbo].[T], DB.dbo.T;
 *  • CREATE TABLE: IDENTITY в любом порядке, PRIMARY KEY ⇒ NOT NULL,
 *    регистронезависимые строки (collation *_CI_AS), проверка внешних ключей;
 *  • проверка типов при INSERT/UPDATE: VARCHAR(n), TINYINT/SMALLINT/INT,
 *    DECIMAL(p,s), DATE/DATETIME/SMALLDATETIME — с ошибками SSMS;
 *  • ALTER TABLE: ALTER COLUMN, ADD/DROP CONSTRAINT (PK, UNIQUE, FK, CHECK,
 *    DEFAULT … FOR), несколько колонок за раз, WITH CHECK;
 *  • DROP TABLE / TRUNCATE с проверкой внешних ключей, сброс IDENTITY;
 *  • функции: DATEADD, DATEDIFF, DATEPART, CAST/CONVERT в даты, LIKE '[A-C]%',
 *    GETDATE() в местном времени, TOP … PERCENT и др. (tsqlfuncs.js);
 *  • IF … / IF … BEGIN … END / ELSE, EXEC sp_rename, sp_help, SET NOCOUNT,
 *    SET IDENTITY_INSERT;
 *  • сообщения об ошибках с номерами SQL Server и подсказки на русском.
 */
import {
  mask, matchParen, splitRanges, splitTopText, splitDotted, stripCommentsKeepLines, unq, qi, ql,
} from './sqlutil.js'
import {
  attachFunctions, parseType, normPart, STRING_TYPES, NORMALIZABLE, CHECKABLE,
} from './tsqlfuncs.js'
import {
  HIDDEN, parseCreate, parseColDef, renderCreate, renderCol, constraintsOf, colsOf, findCol,
  isIdentity, hiddenInfo, pkCols,
} from './schema.js'

const META = '__klerr_schema'
export const isHiddenTable = n => /^__klerr/i.test(n)
const TRG = 'klerr$norm$'
const RESERVED_SCHEMAS = ['dbo', 'sys', 'guest', 'information_schema']

const ID = '\\[[^\\]]*\\]|"[^"]*"|[A-Za-z_#][\\w$#@]*'
const CHAIN_RE = new RegExp(`(?:${ID})(?:\\s*\\.\\s*(?:${ID})?)+`, 'g')
const NAME_RE = `(?:${ID})(?:\\s*\\.\\s*(?:${ID})?)*`

const AFTER_TABLE = new Set(['WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'ON', 'ORDER', 'GROUP',
  'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'SET', 'WITH', 'OPTION', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'VALUES',
  'OUTPUT', 'FOR', 'GO', 'USE', 'CREATE', 'DROP', 'ALTER', 'PRINT', 'IF', 'ELSE', 'BEGIN', 'END', 'EXEC', 'EXECUTE',
  'DECLARE', 'TRUNCATE', 'WINDOW', 'LIMIT', 'OFFSET', 'FETCH', 'PIVOT', 'UNPIVOT', 'APPLY', 'NATURAL'])

export function createDialect(api) {
  const { TErr } = api
  const db = () => api.db()
  const state = { rowcount: 0, nocount: false, identityInsert: new Set() }

  /* ======================= сведения о базе ======================= */

  function all(sql) {
    const r = db().exec(sql)
    return r.length ? r[0].values : []
  }
  function objects() {
    return all("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'")
      .filter(r => !isHiddenTable(r[0]))
      .map(r => ({ name: r[0], type: r[1], sql: r[2] }))
  }
  const findObj = (n, type) => objects().find(o => o.name.toLowerCase() === String(n).toLowerCase() && (!type || o.type === type)) || null
  const findTable = n => { const o = findObj(n, 'table'); return o ? o.name : null }

  function schemas() {
    const set = new Set(['dbo'])
    try { for (const r of all(`SELECT name FROM ${qi(META)}`)) set.add(String(r[0]).toLowerCase()) } catch (e) { /* нет схем */ }
    for (const o of objects()) if (o.name.includes('.')) set.add(o.name.split('.')[0].toLowerCase())
    return set
  }

  function parsed(tbl) {
    const r = all(`SELECT sql FROM sqlite_master WHERE type='table' AND name=${ql(tbl)}`)
    return r.length ? parseCreate(String(r[0][0])) : null
  }

  const dbName = () => api.getCurrent()
  /** Полное имя для сообщений: SchoolDB.dbo.Students */
  const full = t => `${dbName()}.${t.includes('.') ? t : 'dbo.' + t}`
  const short = t => (t.includes('.') ? t : 'dbo.' + t)

  /** Все внешние ключи базы: [{ table, name, cols, refTable, refCols }] */
  function allForeignKeys() {
    const out = []
    for (const o of objects()) {
      if (o.type !== 'table') continue
      const p = parseCreate(String(o.sql))
      if (!p) continue
      for (const c of constraintsOf(p)) if (c.kind === 'fk') out.push({ table: o.name, ...c })
    }
    return out
  }

  /* ======================= переписывание текста ======================= */

  function mapOutside(sql, fn) {
    return sql.split(/('(?:[^']|'')*')/).map((p, i) => (i % 2 ? p : fn(p))).join('')
  }

  function prevWord(m, i) {
    let j = i - 1
    while (j >= 0 && /\s/.test(m[j])) j--
    let e = j + 1
    while (j >= 0 && /\w/.test(m[j])) j--
    return m.slice(j + 1, e).toUpperCase()
  }

  /** Составные имена: схемы, [dbo].[T], DB.dbo.T, DB..T */
  function rewriteNames(sql) {
    const m = mask(sql, false)
    const sch = schemas()
    const objs = objects()
    const has = n => objs.some(o => o.name.toLowerCase() === n.toLowerCase())
    const stmtKw = (m.match(/^\s*(\w+)/) || ['', ''])[1].toUpperCase()
    const dbs = api.getDbs().map(x => x.toLowerCase())
    let out = '', last = 0
    CHAIN_RE.lastIndex = 0
    let mt
    while ((mt = CHAIN_RE.exec(m))) {
      const start = mt.index, end = start + mt[0].length
      if (start > 0 && /[\w$#@.\]"]/.test(m[start - 1])) continue
      let parts = splitDotted(sql.slice(start, end))
      if (parts[parts.length - 1] === '') continue
      const low = parts.map(p => unq(p).toLowerCase())
      // DB.схема.объект[.колонка]
      if (parts.length >= 3 && dbs.includes(low[0]) && !sch.has(low[0])) {
        if (low[0] !== dbName().toLowerCase()) {
          throw TErr(40000, `Cross-database queries are not supported in this trainer. Switch with USE ${unq(parts[0])} first.`)
        }
        parts = parts.slice(1)
        if (parts[0] === '') parts = parts.slice(1)
      }
      const L = parts.map(p => unq(p))
      const ll = L.map(x => x.toLowerCase())
      let rep = null, isTable = false, alias = null
      const kw = prevWord(m, start)
      const tableCtx = ['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'REFERENCES', 'VIEW', 'ON', 'APPLY', 'EXISTS'].includes(kw)
      if (parts.length === 1) {
        rep = parts[0]
      } else if (parts.length === 2) {
        if (ll[0] === 'dbo') { rep = parts[1]; isTable = true; alias = null }
        else if (sch.has(ll[0]) && (has(`${L[0]}.${L[1]}`) || tableCtx)) {
          rep = `[${L[0]}.${L[1]}]`; isTable = true; alias = L[1]
        }
      } else if (parts.length === 3) {
        // схема.таблица.колонка
        if (ll[0] === 'dbo') rep = `${parts[1]}.${parts[2]}`
        else if (sch.has(ll[0]) && has(`${L[0]}.${L[1]}`)) rep = `[${L[1]}].${parts[2]}`
      }
      if (rep === null) continue
      // Таблица из схемы без алиаса — добавляем алиас, как его даёт SQL Server
      if (isTable && alias && (kw === 'FROM' || kw === 'JOIN' || (kw === 'UPDATE' && stmtKw === 'UPDATE')) && /^(SELECT|WITH|UPDATE|DELETE|INSERT|CREATE|IF)$/.test(stmtKw)) {
        const rest = m.slice(end)
        const nx = rest.match(/^\s*([A-Za-z_]\w*|\[|"|[,;)(]|$)/)
        const word = nx ? nx[1].toUpperCase() : ''
        const explicit = word === 'AS' || word === '[' || word === '"' || (/^[A-Z_]\w*$/.test(word) && !AFTER_TABLE.has(word))
        if (!explicit) rep += ` AS [${alias}]`
      }
      out += sql.slice(last, start) + rep
      last = end
    }
    return out + sql.slice(last)
  }

  /** Вызовы функций: переписываем аргументы изнутри наружу. */
  function rewriteCalls(sql, names, fn) {
    const m = mask(sql, true)
    const re = new RegExp(`(^|[^\\w$#@.])(${names})\\s*\\(`, 'gi')
    let out = '', last = 0, mt
    while ((mt = re.exec(m))) {
      const start = mt.index + mt[1].length
      const open = mt.index + mt[0].length - 1
      const close = matchParen(m, open)
      if (close < 0) break
      const args = splitRanges(m, open + 1, close).map(([a, b]) => rewriteCalls(sql.slice(a, b), names, fn))
      const rep = fn(mt[2].toUpperCase(), args)
      out += sql.slice(last, start) + (rep === null ? sql.slice(start, open + 1) + args.join(',') + ')' : rep)
      last = close + 1
      re.lastIndex = close + 1
    }
    return out + sql.slice(last)
  }

  const FN_NAMES = 'DATEADD|DATEDIFF_BIG|DATEDIFF|DATEPART|DATENAME|TRY_CAST|CAST|TRY_CONVERT|CONVERT|LEN|DATALENGTH|GETDATE|SYSDATETIME|GETUTCDATE|SYSUTCDATETIME|SCOPE_IDENTITY'

  function datepartArg(a, fn) {
    const t = a.trim()
    if (/^N?'/.test(t)) return t
    if (!normPart(t)) throw TErr(155, `'${t}' is not a recognized ${fn.toLowerCase()} option.`)
    return ql(t.toLowerCase())
  }

  function lastAs(arg) {
    const m = mask(arg, true)
    let d = 0, pos = -1
    for (let i = 0; i < m.length; i++) {
      if (m[i] === '(') d++
      else if (m[i] === ')') d--
      else if (d === 0 && /\bAS\b/i.test(m.slice(i, i + 3)) && (i === 0 || /\s/.test(m[i - 1])) && /\s/.test(m[i + 2] || '')) pos = i
    }
    return pos
  }

  function rewriteFunctions(sql) {
    sql = mapOutside(sql, p => p
      .replace(/\bDEFAULT\s*(?:\(\s*(?:GETDATE|SYSDATETIME)\s*\(\s*\)\s*\)|(?:GETDATE|SYSDATETIME)\s*\(\s*\))/gi, "DEFAULT (datetime('now','localtime'))")
      .replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\b/gi, "DEFAULT (datetime('now','localtime'))")
      .replace(/(^|[^\w$#@.])CURRENT_TIMESTAMP\b/gi, '$1T_NOW()')
      .replace(/@@VERSION\b/gi, 'T_VERSION()')
      .replace(/@@ROWCOUNT\b/gi, 'T_ROWCOUNT()')
      .replace(/@@IDENTITY\b/gi, 'last_insert_rowid()')
      .replace(/@@SERVERNAME\b/gi, "'KLERR'")
      .replace(/\bCOLLATE\s+(\w+)/gi, (_, c) => (/_CS|_BIN/i.test(c) ? 'COLLATE BINARY' : /^(NOCASE|BINARY|RTRIM)$/i.test(c) ? 'COLLATE ' + c : 'COLLATE NOCASE')))
    return rewriteCalls(sql, FN_NAMES, (name, a) => {
      switch (name) {
        case 'DATEADD':
          if (a.length !== 3) throw TErr(174, 'The dateadd function requires 3 argument(s).')
          return `${/^\s*N?'/.test(a[2]) ? 'T_DATEADD_LIT' : 'DATEADD'}(${datepartArg(a[0], name)},${a[1]},${a[2]})`
        case 'DATEDIFF': case 'DATEDIFF_BIG':
          if (a.length !== 3) throw TErr(174, `The ${name.toLowerCase()} function requires 3 argument(s).`)
          return `DATEDIFF(${datepartArg(a[0], name)},${a[1]},${a[2]})`
        case 'DATEPART': case 'DATENAME':
          if (a.length !== 2) throw TErr(174, `The ${name.toLowerCase()} function requires 2 argument(s).`)
          return `${name}(${datepartArg(a[0], name)},${a[1]})`
        case 'CAST': case 'TRY_CAST': {
          const arg = a.join(',')
          const pos = lastAs(arg)
          if (pos < 0) throw TErr(102, "Incorrect syntax near ')'.")
          const type = arg.slice(pos + 2).trim()
          return `${name === 'CAST' ? 'T_CAST' : 'T_TRYCAST'}(${arg.slice(0, pos)}, ${ql(type)})`
        }
        case 'CONVERT': case 'TRY_CONVERT': {
          if (a.length < 2) throw TErr(102, "Incorrect syntax near ')'.")
          return `${name === 'CONVERT' ? 'T_CONVERT' : 'T_TRYCONVERT'}(${a[1]}, ${ql(a[0].trim())}, ${a[2] !== undefined ? a[2] : 'NULL'})`
        }
        case 'LEN': return `T_LEN(${a.join(',')})`
        case 'DATALENGTH': return `T_DATALENGTH(${a.join(',')})`
        case 'GETDATE': case 'SYSDATETIME': return 'T_NOW()'
        case 'GETUTCDATE': case 'SYSUTCDATETIME': return 'T_UTCNOW()'
        case 'SCOPE_IDENTITY': return 'last_insert_rowid()'
      }
      return null
    })
  }

  function rewrite(sql) {
    return rewriteFunctions(rewriteNames(sql))
  }

  /* ======================= типы колонок ======================= */

  /** Скрытая проверка типа (CHECK) для колонки по T-SQL-типу. */
  function hiddenSeg(col, t) {
    if (!t || !CHECKABLE(t.base)) return null
    let a = t.a, b = t.b
    if (STRING_TYPES.includes(t.base)) {
      if (t.max) return null
      if (!t.hasArgs) a = 1 // VARCHAR без длины в CREATE TABLE = VARCHAR(1)
    }
    const lit = v => (v === null || v === undefined ? 'NULL' : String(v))
    return {
      name: HIDDEN + col,
      kind: 'check',
      body: `CHECK (KLERR_T(${qi(col)}, '${t.base}', ${lit(a)}, ${lit(b)}, ${ql(col)}))`,
    }
  }

  function applyColumnRules(c, t, { identity = false } = {}) {
    c.segs = c.segs.filter(s => !(s.name && s.name.startsWith(HIDDEN)))
    const isStr = t && (STRING_TYPES.includes(t.base) || t.base === 'text' || t.base === 'ntext')
    if (isStr && !c.segs.some(s => s.kind === 'collate')) c.segs.push({ name: null, kind: 'collate', body: 'COLLATE NOCASE' })
    if (!isStr) c.segs = c.segs.filter(s => s.kind !== 'collate')
    if (!identity) { const h = hiddenSeg(c.name, t); if (h) c.segs.push(h) }
  }

  /** Триггеры, приводящие значения к виду SQL Server (DECIMAL(5,2) → 2 знака, даты и т. п.). */
  function refreshTriggers(tbl, normalizeNow = false) {
    for (const r of all(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=${ql(tbl)} AND name LIKE 'klerr$norm$%'`)) {
      db().run(`DROP TRIGGER ${qi(r[0])}`)
    }
    const p = parsed(tbl)
    if (!p) return
    const sets = []
    for (const c of colsOf(p)) {
      if (isIdentity(c)) continue
      const h = hiddenInfo(c)
      if (h && NORMALIZABLE(h.base)) {
        const lit = v => (v === null ? 'NULL' : String(v))
        sets.push(`${qi(c.name)} = KLERR_N(${qi(c.name)}, '${h.base}', ${lit(h.a)}, ${lit(h.b)})`)
      }
    }
    if (!sets.length) return
    const upd = `UPDATE ${qi(tbl)} SET ${sets.join(', ')}`
    db().run(`CREATE TRIGGER ${qi(TRG + tbl + '$i')} AFTER INSERT ON ${qi(tbl)} BEGIN ${upd} WHERE rowid = NEW.rowid; END`)
    db().run(`CREATE TRIGGER ${qi(TRG + tbl + '$u')} AFTER UPDATE ON ${qi(tbl)} BEGIN ${upd} WHERE rowid = NEW.rowid; END`)
    if (normalizeNow) db().run(upd)
  }

  /* ======================= пересборка таблицы ======================= */

  function rebuild(tbl, p, { renameCols = {} } = {}) {
    const d = db()
    const oldCols = colsOf(parsed(tbl)).map(c => c.name)
    const newCols = colsOf(p).map(c => c.name)
    const pairs = []
    for (const nc of newCols) {
      const src = Object.keys(renameCols).find(k => renameCols[k].toLowerCase() === nc.toLowerCase()) ||
        oldCols.find(o => o.toLowerCase() === nc.toLowerCase())
      if (src && oldCols.some(o => o.toLowerCase() === src.toLowerCase())) pairs.push([src, nc])
    }
    const indexes = all(`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=${ql(tbl)} AND sql IS NOT NULL`).map(r => r[0])
    let seq = null
    try { const r = all(`SELECT seq FROM sqlite_sequence WHERE name=${ql(tbl)}`); if (r.length) seq = r[0][0] } catch (e) { /* нет AUTOINCREMENT */ }
    const tmp = '__klerr_tmp'
    d.run('PRAGMA foreign_keys=OFF')
    d.run('SAVEPOINT klerr_rebuild')
    try {
      d.run(`DROP TABLE IF EXISTS ${qi(tmp)}`)
      d.run(renderCreate(p, tmp))
      if (pairs.length) {
        d.run(`INSERT INTO ${qi(tmp)} (${pairs.map(x => qi(x[1])).join(', ')}) SELECT ${pairs.map(x => qi(x[0])).join(', ')} FROM ${qi(tbl)}`)
      }
      d.run(`DROP TABLE ${qi(tbl)}`)
      d.run('PRAGMA legacy_alter_table=ON')
      try { d.run(`ALTER TABLE ${qi(tmp)} RENAME TO ${qi(tbl)}`) } finally { d.run('PRAGMA legacy_alter_table=OFF') }
      // имя таблицы внутри CREATE TABLE после переименования в legacy-режиме не меняется
      for (const sql of indexes) { try { d.run(sql) } catch (e) { /* индекс на удалённую колонку */ } }
      if (seq !== null) d.run(`INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES (${ql(tbl)}, ${seq})`)
      refreshTriggers(tbl, true)
      const bad = d.exec('PRAGMA foreign_key_check')
      if (bad.length && bad[0].values.length) {
        const [child, , parent] = bad[0].values[0]
        const e = new Error('KLERR_FKCHECK'); e.child = child; e.parent = parent
        throw e
      }
      d.run('RELEASE klerr_rebuild')
    } catch (e) {
      d.run('ROLLBACK TO klerr_rebuild')
      d.run('RELEASE klerr_rebuild')
      throw e
    } finally {
      d.run('PRAGMA foreign_keys=ON')
    }
  }

  /* ======================= CREATE TABLE ======================= */

  function checkSchemaOf(rawName) {
    const parts = splitDotted(rawName)
    if (parts.length > 1) {
      const s = unq(parts[parts.length - 2])
      if (s.toLowerCase() !== 'dbo') throw TErr(2760, `The specified schema name "${s}" either does not exist or you do not have permission to use it.`)
    }
  }

  function checkForeignKeys(tblName, p, fks) {
    for (const fk of fks) {
      const refName = fk.refTable && fk.refTable.toLowerCase() === tblName.toLowerCase() ? tblName : findTable(fk.refTable || '')
      if (!refName) {
        throw TErr(1767, `Foreign key '${fk.name}' references invalid table '${short(fk.refTable || '?')}'.\nMsg 1750, Level 16, State 1\nCould not create constraint or index. See previous errors.`)
      }
      const rp = refName === tblName ? p : parsed(refName)
      const keys = constraintsOf(rp).filter(c => c.kind === 'pk' || c.kind === 'unique').map(c => c.cols.map(x => x.toLowerCase()).sort().join(','))
      const want = (fk.refCols.length ? fk.refCols : pkCols(rp)).map(x => x.toLowerCase()).sort().join(',')
      if (!keys.includes(want)) {
        throw TErr(1776, `There are no primary or candidate keys in the referenced table '${short(refName)}' that match the referencing column list in the foreign key '${fk.name}'.\nMsg 1750, Level 16, State 1\nCould not create constraint or index. See previous errors.`)
      }
      const cols = fk.cols.map(x => x.toLowerCase())
      for (const c of cols) {
        if (!findCol(p, c)) throw TErr(1769, `Foreign key '${fk.name}' references invalid column '${c}' in referencing table '${p.name}'.`)
      }
    }
  }

  function createTable(s) {
    const m = s.match(new RegExp(`^\\s*CREATE\\s+TABLE\\s+(${NAME_RE})\\s*\\(([\\s\\S]*)\\)\\s*$`, 'i'))
    if (!m) return null
    checkSchemaOf(m[1])
    const name = unq(m[1])
    if (findObj(name)) throw TErr(2714, `There is already an object named '${name.split('.').pop()}' in the database.`)

    const types = {}
    const identity = { col: null, seed: 1, pkName: null }
    let defs = splitTopText(m[2]).map(d => d.trim())

    defs = defs.map(d => {
      if (!d || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|INDEX)\b/i.test(d)) return d
      const mm = d.match(/^(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s+(\w+)\s*(\([^)]*\))?([\s\S]*)$/)
      if (!mm) return d
      const col = unq(mm[1])
      types[col.toLowerCase()] = parseType(mm[2] + (mm[3] || ''))
      let rest = mm[4].replace(/\bFOREIGN\s+KEY\s+(?=REFERENCES\b)/i, '')
      const idm = rest.match(/\bIDENTITY\s*(?:\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\))?/i)
      if (!idm) return `${mm[1]} ${mm[2]}${mm[3] || ''} ${rest.trim()}`.trim()
      identity.col = col
      identity.seed = idm[1] !== undefined ? +idm[1] : 1
      rest = rest.replace(idm[0], ' ').replace(/\bNOT\s+NULL\b/i, ' ').replace(/(^|\s)NULL\b/i, ' ')
      const pkm = rest.match(/(?:\bCONSTRAINT\s+(\[[^\]]+\]|"[^"]*"|\w+)\s+)?\bPRIMARY\s+KEY\b(?:\s+(?:CLUSTERED|NONCLUSTERED))?/i)
      if (pkm) { identity.pkName = pkm[1] ? unq(pkm[1]) : null; rest = rest.replace(pkm[0], ' ') }
      return `${mm[1]} INT IDENTITY(1,1) PRIMARY KEY ${rest.trim()}`.trim()
    })

    // PRIMARY KEY уровня таблицы на IDENTITY-колонке переносим в колонку
    if (identity.col) {
      defs = defs.filter(d => {
        const t = d.match(/^(?:CONSTRAINT\s+(\[[^\]]+\]|"[^"]*"|\w+)\s+)?PRIMARY\s+KEY\s*(?:CLUSTERED|NONCLUSTERED)?\s*\(([^)]*)\)\s*$/i)
        if (!t) return true
        const cols = t[2].split(',').map(x => unq(x.trim().replace(/\s+(ASC|DESC)$/i, '')).toLowerCase())
        if (cols.length === 1 && cols[0] === identity.col.toLowerCase()) {
          if (t[1]) identity.pkName = unq(t[1])
          return false
        }
        return true
      })
    }

    const tsql = `CREATE TABLE [${name}] (\n  ${defs.join(',\n  ')}\n)`
    api.validateTsql(tsql, api.makeCtx())
    const p = parseCreate(api.translate(tsql))
    if (!p) throw TErr(102, "Incorrect syntax near ')'.")
    p.name = name

    const pkSet = new Set(pkCols(p).map(x => x.toLowerCase()))
    for (const c of colsOf(p)) {
      const isId = identity.col && c.name.toLowerCase() === identity.col.toLowerCase()
      if (isId && identity.pkName) {
        const seg = c.segs.find(x => x.kind === 'pk')
        if (seg) seg.name = identity.pkName
      }
      if (pkSet.has(c.name.toLowerCase()) && !isId && !c.segs.some(x => x.kind === 'notnull')) {
        c.segs = c.segs.filter(x => x.kind !== 'null')
        c.segs.unshift({ name: null, kind: 'notnull', body: 'NOT NULL' })
      }
      applyColumnRules(c, types[c.name.toLowerCase()], { identity: isId })
    }

    const fks = constraintsOf(p).filter(c => c.kind === 'fk')
    checkForeignKeys(name, p, fks)
    checkDuplicateNames(constraintsOf(p).filter(c => !c.auto), null)

    db().run(renderCreate(p))
    if (identity.col && identity.seed !== 1) {
      db().run(`INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES (${ql(name)}, ${identity.seed - 1})`)
    }
    refreshTriggers(name)
    return [{ msg: 'Commands completed successfully.' }]
  }

  function checkDuplicateNames(list, exceptTable) {
    if (!list.length) return
    const names = new Map()
    for (const o of objects()) {
      if (o.type !== 'table' || (exceptTable && o.name === exceptTable)) continue
      const p = parseCreate(String(o.sql))
      if (p) for (const c of constraintsOf(p)) if (!c.auto) names.set(c.name.toLowerCase(), o.name)
      names.set(o.name.split('.').pop().toLowerCase(), o.name)
    }
    const seen = new Set()
    for (const c of list) {
      const k = c.name.toLowerCase()
      if (names.has(k) || seen.has(k)) {
        throw TErr(2714, `There is already an object named '${c.name}' in the database.\nMsg 1750, Level 16, State 0\nCould not create constraint or index. See previous errors.`)
      }
      seen.add(k)
    }
  }

  /* ======================= ALTER TABLE ======================= */

  const notFoundTable = n => TErr(4902, `Cannot find the object "${n}" because it does not exist or you do not have permissions.`)

  function tsqlColumn(def) {
    const mm = def.trim().match(/^(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s+(\w+)\s*(\([^)]*\))?([\s\S]*)$/)
    if (!mm) throw TErr(102, `Incorrect syntax near '${def.trim().split(/\s+/)[0] || ''}'.`)
    api.validateCreateTable(def.replace(/\bIDENTITY\s*(\([^)]*\))?/i, ''))
    return { name: unq(mm[1]), type: parseType(mm[2] + (mm[3] || '')), rest: mm[4] }
  }

  function alterTable(s) {
    const m = s.match(new RegExp(`^\\s*ALTER\\s+TABLE\\s+(${NAME_RE})\\s+([\\s\\S]+)$`, 'i'))
    if (!m) return null
    const rawName = unq(m[1])
    const tbl = findTable(rawName)
    let rest = m[2].trim().replace(/^WITH\s+(?:NO)?CHECK\s+(?=ADD\b|CHECK\b)/i, '')
    if (!tbl) throw notFoundTable(rawName)

    if (/^(NO)?CHECK\s+CONSTRAINT\b/i.test(rest)) return [{ msg: 'Commands completed successfully.' }]
    if (/^RENAME\b/i.test(rest)) throw TErr(102, "Incorrect syntax near 'RENAME'.")

    let mm
    if ((mm = rest.match(/^ALTER\s+COLUMN\s+([\s\S]+)$/i))) return alterColumn(tbl, mm[1])
    if ((mm = rest.match(/^DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i))) return dropConstraints(tbl, mm[2], !!mm[1])
    if ((mm = rest.match(/^DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i))) return dropColumns(tbl, mm[2], !!mm[1])
    if ((mm = rest.match(/^DROP\s+(?!COLUMN\b|CONSTRAINT\b)([\s\S]+)$/i))) return dropConstraints(tbl, mm[1], false)
    if ((mm = rest.match(/^ADD\s+([\s\S]+)$/i))) {
      const out = []
      for (const item of splitTopText(mm[1]).map(x => x.trim()).filter(Boolean)) {
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(item)) addConstraint(tbl, item)
        else addColumn(tbl, item.replace(/^COLUMN\s+/i, ''))
      }
      out.push({ msg: 'Commands completed successfully.' })
      return out
    }
    return null
  }

  function addColumn(tbl, def) {
    const t = tsqlColumn(def)
    const p = parsed(tbl)
    if (findCol(p, t.name)) throw TErr(2705, `Column names in each table must be unique. Column name '${t.name}' in table '${short(tbl)}' is specified more than once.`)
    const isIdent = /\bIDENTITY\b/i.test(t.rest)
    let sqliteDef = api.translate(def.replace(/\bFOREIGN\s+KEY\s+(?=REFERENCES\b)/i, ''))
    if (isIdent) sqliteDef = `${qi(t.name)} INTEGER`
    const c = parseColDef(sqliteDef)
    applyColumnRules(c, t.type, { identity: false })
    const notNull = c.segs.some(x => x.kind === 'notnull')
    const hasDefault = c.segs.some(x => x.kind === 'default')
    const rows = all(`SELECT COUNT(*) FROM ${qi(tbl)}`)[0][0]
    if (isIdent) {
      throw TErr(40000, 'Adding an IDENTITY column with ALTER TABLE is not supported in this trainer. Recreate the table with the IDENTITY column instead.')
    }
    if (notNull && !hasDefault && rows > 0) {
      throw TErr(4901, `ALTER TABLE only allows columns to be added that can contain nulls, or have a DEFAULT definition specified, or the column being added is an identity or timestamp column, or alternatively if none of the previous conditions are satisfied the table must be empty to allow addition of this column. Column '${t.name}' cannot be added to non-empty table '${tbl.split('.').pop()}' because it does not satisfy these conditions.`)
    }
    const fkSeg = c.segs.find(x => x.kind === 'fk')
    p.defs.push(c)
    if (fkSeg) checkForeignKeys(tbl, p, constraintsOf(p).filter(x => x.kind === 'fk' && x.col === c.name))
    try { rebuild(tbl, p) } catch (e) { throw alterError(e, tbl, null) }
  }

  function addConstraint(tbl, item) {
    const p = parsed(tbl)
    // DEFAULT … FOR колонка
    let dm = item.match(/^(?:CONSTRAINT\s+(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s+)?DEFAULT\s+([\s\S]+?)\s+FOR\s+(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s*$/i)
    if (dm) {
      const name = dm[1] ? unq(dm[1]) : null
      const col = findCol(p, unq(dm[3]))
      if (!col) throw TErr(1752, `Column '${unq(dm[3])}' in table '${short(tbl)}' is invalid for creating a default constraint.`)
      if (col.segs.some(x => x.kind === 'default')) throw TErr(1781, 'Column already has a DEFAULT bound to it.\nMsg 1750, Level 16, State 0\nCould not create constraint or index. See previous errors.')
      if (name) checkDuplicateNames([{ name }], null)
      let v = api.translate(dm[2].trim())
      if (!/^(\(.*\)|'(?:[^']|'')*'|[+-]?\d+(\.\d+)?|NULL)$/is.test(v)) v = `(${v})`
      col.segs.push({ name, kind: 'default', body: `DEFAULT ${v}` })
      rebuild(tbl, p)
      return
    }
    const sqliteText = api.translate(item.replace(/\b(?:NON)?CLUSTERED\b/gi, ''))
    const tp = parseCreate(`CREATE TABLE x (${sqliteText})`)
    const def = tp && tp.defs[0]
    if (!def || def.kind !== 'tbl') throw TErr(102, `Incorrect syntax near '${item.split(/\s+/)[0]}'.`)
    def.name = def.name || null
    const cons = constraintsOf({ name: tbl, defs: [def] })[0]
    if (!cons.auto) checkDuplicateNames([cons], null)
    for (const c of def.cols) if (!findCol(p, c)) throw TErr(1911, `Column name '${c}' does not exist in the target table or view.`)
    if (def.ckind === 'pk') {
      if (pkCols(p).length) throw TErr(1779, `Table '${tbl.split('.').pop()}' already has a primary key defined on it.\nMsg 1750, Level 16, State 0\nCould not create constraint or index. See previous errors.`)
      for (const cn of def.cols) {
        const c = findCol(p, cn)
        if (!c.segs.some(x => x.kind === 'notnull')) {
          throw TErr(8111, `Cannot define PRIMARY KEY constraint on nullable column in table '${tbl.split('.').pop()}'.\nMsg 1750, Level 16, State 0\nCould not create constraint or index. See previous errors.`)
        }
      }
    }
    p.defs.push(def)
    if (def.ckind === 'fk') {
      if (!def.name) def.name = null
      checkForeignKeys(tbl, p, [{ ...cons, cols: def.cols, refTable: def.refTable, refCols: def.refCols }])
    }
    try { rebuild(tbl, p) } catch (e) { throw alterError(e, tbl, cons) }
  }

  function alterError(e, tbl, cons) {
    const msg = e && e.message ? e.message : String(e)
    if (msg === 'KLERR_FKCHECK' || /FOREIGN KEY constraint failed/.test(msg)) {
      return TErr(547, `The ALTER TABLE statement conflicted with the FOREIGN KEY constraint "${cons ? cons.name : 'FK'}". The conflict occurred in database "${dbName()}", table "${short(e.parent || (cons && cons.refTable) || tbl)}".`)
    }
    if (/UNIQUE constraint failed/.test(msg)) {
      return TErr(1505, `The CREATE UNIQUE INDEX statement terminated because a duplicate key was found for the object name '${short(tbl)}' and the index name '${cons ? cons.name : 'UQ'}'.\nMsg 1750, Level 16, State 1\nCould not create constraint or index. See previous errors.`)
    }
    let t
    if ((t = msg.match(/CHECK constraint failed: (.+)/)) && !t[1].startsWith(HIDDEN)) {
      return TErr(547, `The ALTER TABLE statement conflicted with the CHECK constraint "${t[1]}". The conflict occurred in database "${dbName()}", table "${short(tbl)}".`)
    }
    if ((t = msg.match(/NOT NULL constraint failed: .+\.([^.]+)$/))) {
      return TErr(515, `Cannot insert the value NULL into column '${t[1]}', table '${full(tbl)}'; column does not allow nulls. UPDATE fails.`)
    }
    return e
  }

  function dependents(tbl, p, col) {
    const lc = col.toLowerCase()
    const out = []
    for (const c of constraintsOf(p)) {
      const touches = c.cols.some(x => x.toLowerCase() === lc) ||
        (c.kind === 'check' && new RegExp(`(^|[^\\w])["\\[]?${col.replace(/[$]/g, '\\$')}["\\]]?([^\\w]|$)`, 'i').test((c.seg || c.def).body))
      if (touches) out.push(c.name)
    }
    for (const fk of allForeignKeys()) {
      if (fk.table === tbl) continue
      if ((fk.refTable || '').toLowerCase() === tbl.toLowerCase() && (fk.refCols.length ? fk.refCols : pkCols(p)).some(x => x.toLowerCase() === lc)) out.push(fk.name)
    }
    return out
  }

  function alterColumn(tbl, text) {
    const mm = text.trim().match(/^(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s+(\w+\s*(?:\([^)]*\))?)\s*(COLLATE\s+\w+\s*)?(NOT\s+NULL|NULL)?\s*$/i)
    if (!mm) throw TErr(102, `Incorrect syntax near '${text.trim().split(/\s+/).pop()}'.`)
    const colName = unq(mm[1])
    const p = parsed(tbl)
    const col = findCol(p, colName)
    if (!col) throw TErr(4924, `ALTER TABLE ALTER COLUMN failed because column '${colName}' does not exist in table '${tbl.split('.').pop()}'.`)
    const t = tsqlColumn(`${mm[1]} ${mm[2]}`)
    const deps = dependents(tbl, p, col.name).filter(n => {
      const c = constraintsOf(p).find(x => x.name === n)
      return !c || c.kind !== 'default'
    })
    if (deps.length) {
      throw TErr(5074, `The object '${deps[0]}' is dependent on column '${col.name}'.\nMsg 4922, Level 16, State 9\nALTER TABLE ALTER COLUMN ${col.name} failed because one or more objects access this column.`)
    }
    if (isIdentity(col)) throw TErr(40000, 'ALTER COLUMN on an IDENTITY column is not supported in this trainer.')
    col.type = api.translate(mm[2]).trim()
    col.segs = col.segs.filter(x => x.kind !== 'notnull' && x.kind !== 'null')
    if (mm[3]) { col.segs = col.segs.filter(x => x.kind !== 'collate'); col.segs.push({ name: null, kind: 'collate', body: rewriteFunctions(mm[3].trim()) }) }
    if (mm[4] && /NOT/i.test(mm[4])) col.segs.unshift({ name: null, kind: 'notnull', body: 'NOT NULL' })
    applyColumnRules(col, t.type)
    try { rebuild(tbl, p) } catch (e) { throw alterError(e, tbl, null) }
    return [{ msg: 'Commands completed successfully.' }]
  }

  function dropColumns(tbl, list, ifExists) {
    const p = parsed(tbl)
    for (const raw of splitTopText(list)) {
      const name = unq(raw.trim())
      const col = findCol(p, name)
      if (!col) {
        if (ifExists) continue
        throw TErr(4924, `ALTER TABLE DROP COLUMN failed because column '${name}' does not exist in table '${tbl.split('.').pop()}'.`)
      }
      const deps = dependents(tbl, p, col.name)
      if (deps.length) {
        throw TErr(5074, `The object '${deps[0]}' is dependent on column '${col.name}'.\nMsg 4922, Level 16, State 9\nALTER TABLE DROP COLUMN ${col.name} failed because one or more objects access this column.`)
      }
      p.defs = p.defs.filter(d => d !== col)
    }
    if (!colsOf(p).length) throw TErr(4923, `ALTER TABLE DROP COLUMN failed because '${name0(list)}' is the only data column in table '${tbl.split('.').pop()}'. A table must have at least one data column.`)
    rebuild(tbl, p)
    return [{ msg: 'Commands completed successfully.' }]
  }
  const name0 = list => unq(splitTopText(list)[0].trim())

  function removeConstraint(p, name) {
    const c = constraintsOf(p).find(x => x.name.toLowerCase() === name.toLowerCase())
    if (!c) return null
    if (c.seg) c.def.segs = c.def.segs.filter(s => s !== c.seg)
    else p.defs = p.defs.filter(d => d !== c.def)
    return c
  }

  function dropConstraints(tbl, list, ifExists) {
    const p = parsed(tbl)
    for (const raw of splitTopText(list)) {
      const name = unq(raw.trim().replace(/^CONSTRAINT\s+/i, ''))
      const c = constraintsOf(p).find(x => x.name.toLowerCase() === name.toLowerCase())
      if (!c) {
        if (ifExists) continue
        throw TErr(3728, `'${name}' is not a constraint.\nMsg 3727, Level 16, State 0\nCould not drop constraint. See previous errors.`)
      }
      if (c.kind === 'pk') {
        const refs = allForeignKeys().filter(fk => fk.table !== tbl && (fk.refTable || '').toLowerCase() === tbl.toLowerCase())
        if (refs.length) {
          throw TErr(3725, `The constraint '${c.name}' is being referenced by table '${refs[0].table.split('.').pop()}', foreign key constraint '${refs[0].name}'.\nMsg 3727, Level 16, State 0\nCould not drop constraint. See previous errors.`)
        }
        if (c.seg && /AUTOINCREMENT/i.test(c.seg.body)) {
          c.def.type = 'INTEGER'
          c.def.segs = c.def.segs.filter(s => s !== c.seg)
          c.def.segs.unshift({ name: null, kind: 'notnull', body: 'NOT NULL' })
          continue
        }
      }
      removeConstraint(p, c.name)
    }
    rebuild(tbl, p)
    return [{ msg: 'Commands completed successfully.' }]
  }

  /* ======================= DROP / TRUNCATE ======================= */

  function dropTables(s) {
    const m = s.match(/^\s*DROP\s+TABLE\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i)
    if (!m) return null
    for (const raw of splitTopText(m[2])) {
      const n = unq(raw.trim())
      const tbl = findTable(n)
      if (!tbl) {
        if (m[1]) continue
        throw TErr(3701, `Cannot drop the table '${n.includes('.') ? n : n}', because it does not exist or you do not have permission.`)
      }
      const refs = allForeignKeys().filter(fk => fk.table !== tbl && (fk.refTable || '').toLowerCase() === tbl.toLowerCase())
      if (refs.length) throw TErr(3726, `Could not drop object '${short(tbl)}' because it is referenced by a FOREIGN KEY constraint.`)
      db().run('PRAGMA foreign_keys=OFF')
      try { db().run(`DROP TABLE ${qi(tbl)}`) } finally { db().run('PRAGMA foreign_keys=ON') }
      try { db().run(`DELETE FROM sqlite_sequence WHERE name=${ql(tbl)}`) } catch (e) { /* нет sqlite_sequence */ }
    }
    return [{ msg: 'Commands completed successfully.' }]
  }

  function truncate(s) {
    const m = s.match(new RegExp(`^\\s*TRUNCATE\\s+TABLE\\s+(${NAME_RE})\\s*$`, 'i'))
    if (!m) return null
    const n = unq(m[1])
    const tbl = findTable(n)
    if (!tbl) throw TErr(4701, `Cannot find the object "${n}" because it does not exist or you do not have permissions.`)
    const refs = allForeignKeys().filter(fk => fk.table !== tbl && (fk.refTable || '').toLowerCase() === tbl.toLowerCase())
    if (refs.length) throw TErr(4712, `Cannot truncate table '${short(tbl)}' because it is being referenced by a FOREIGN KEY constraint.`)
    db().run(`DELETE FROM ${qi(tbl)}`)
    try { db().run(`DELETE FROM sqlite_sequence WHERE name=${ql(tbl)}`) } catch (e) { /* нет sqlite_sequence */ }
    return [{ msg: 'Commands completed successfully.' }]
  }

  function dropIndex(s) {
    const m = s.match(new RegExp(`^\\s*DROP\\s+INDEX\\s+(IF\\s+EXISTS\\s+)?(${NAME_RE})(?:\\s+ON\\s+(${NAME_RE}))?\\s*$`, 'i'))
    if (!m) return null
    let ix = unq(m[2])
    if (!m[3] && ix.includes('.')) ix = splitDotted(m[2]).pop()
    ix = unq(ix)
    const r = all(`SELECT name FROM sqlite_master WHERE type='index' AND lower(name)=lower(${ql(ix)})`)
    if (!r.length) {
      if (m[1]) return [{ msg: 'Commands completed successfully.' }]
      throw TErr(3701, `Cannot drop the index '${ix}', because it does not exist or you do not have permission.`)
    }
    db().run(`DROP INDEX ${qi(r[0][0])}`)
    return [{ msg: 'Commands completed successfully.' }]
  }

  /* ======================= схемы ======================= */

  function ensureMeta() {
    db().run(`CREATE TABLE IF NOT EXISTS ${qi(META)} (name TEXT PRIMARY KEY COLLATE NOCASE)`)
  }

  function schemaStmt(s) {
    let m
    if ((m = s.match(/^\s*CREATE\s+SCHEMA\s+(\[[^\]]+\]|"[^"]*"|[\w$#@]+)(?:\s+AUTHORIZATION\s+\S+)?\s*$/i))) {
      const n = unq(m[1])
      if (RESERVED_SCHEMAS.includes(n.toLowerCase()) || schemas().has(n.toLowerCase())) throw TErr(2714, `There is already an object named '${n}' in the database.`)
      ensureMeta()
      db().run(`INSERT INTO ${qi(META)}(name) VALUES (${ql(n)})`)
      return [{ msg: 'Commands completed successfully.' }]
    }
    if ((m = s.match(/^\s*DROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?(\[[^\]]+\]|"[^"]*"|[\w$#@]+)\s*$/i))) {
      const n = unq(m[2])
      if (!schemas().has(n.toLowerCase()) || n.toLowerCase() === 'dbo') {
        if (m[1]) return [{ msg: 'Commands completed successfully.' }]
        throw TErr(3701, `Cannot drop the schema '${n}', because it does not exist or you do not have permission.`)
      }
      const used = objects().find(o => o.name.toLowerCase().startsWith(n.toLowerCase() + '.'))
      if (used) throw TErr(3729, `Cannot drop schema '${n}' because it is being referenced by object '${used.name.split('.').pop()}'.`)
      try { db().run(`DELETE FROM ${qi(META)} WHERE name=${ql(n)}`) } catch (e) { /* нет таблицы схем */ }
      return [{ msg: 'Commands completed successfully.' }]
    }
    return null
  }

  /* ======================= процедуры ======================= */

  function execProc(s) {
    const m = s.match(/^\s*(?:EXEC|EXECUTE)\s+(?:(?:\[?\w+\]?)\.)?(?:\[?dbo\]?\.)?\[?(sp_\w+)\]?\s*([\s\S]*)$/i)
    if (!m) return null
    const proc = m[1].toLowerCase()
    const args = m[2].trim() ? splitTopText(m[2]).map(a => {
      const t = a.trim().replace(/^@\w+\s*=\s*/, '')
      const sm = t.match(/^N?'((?:[^']|'')*)'$/)
      return sm ? sm[1].replace(/''/g, "'") : unq(t)
    }) : []
    if (proc === 'sp_rename') return spRename(args)
    if (proc === 'sp_help') return spHelp(args[0])
    if (proc === 'sp_helpdb' || proc === 'sp_databases') return [{ set: { cols: ['name'], rows: api.getDbs().map(n => [n]) }, msg: null }]
    if (proc === 'sp_tables') return [{ set: { cols: ['TABLE_QUALIFIER', 'TABLE_OWNER', 'TABLE_NAME', 'TABLE_TYPE'], rows: objects().map(o => [dbName(), o.name.includes('.') ? o.name.split('.')[0] : 'dbo', o.name.split('.').pop(), o.type === 'view' ? 'VIEW' : 'TABLE']) } }]
    if (proc === 'sp_columns') return spHelp(args[0]).slice(1, 2)
    throw TErr(2812, `Could not find stored procedure '${m[1]}'.`)
  }

  const resolveName = n => {
    const parts = splitDotted(n).map(unq)
    if (parts.length >= 2 && parts[0].toLowerCase() === 'dbo') parts.shift()
    return parts.join('.')
  }

  function spRename(args) {
    if (args.length < 2) throw TErr(201, "Procedure or function 'sp_rename' expects parameter '@newname', which was not supplied.")
    const [oldRaw, newName, type] = args
    const kind = (type || '').toUpperCase()
    const caution = { msg: 'Caution: Changing any part of an object name could break scripts and stored procedures.' }
    if (kind === 'COLUMN') {
      const parts = splitDotted(oldRaw).map(unq)
      const colName = parts.pop()
      const tbl = findTable(resolveName(parts.join('.')))
      const p = tbl && parsed(tbl)
      const col = p && findCol(p, colName)
      if (!col) throw TErr(15248, `Either the parameter @objname is ambiguous or the claimed @objtype (COLUMN) is wrong.`)
      if (findCol(p, newName)) throw TErr(15335, `Error: The new name '${newName}' is already in use as a COLUMN name and would cause a duplicate that is not permitted.`)
      const t = hiddenInfo(col)
      db().run(`ALTER TABLE ${qi(tbl)} RENAME COLUMN ${qi(col.name)} TO ${qi(newName)}`)
      if (t) {
        const p2 = parsed(tbl)
        const c2 = findCol(p2, newName)
        applyColumnRules(c2, { base: t.base, a: t.a, b: t.b, max: false, hasArgs: true })
        rebuild(tbl, p2)
      }
      return [caution]
    }
    const target = resolveName(oldRaw)
    const tbl = findObj(target)
    if (tbl && kind !== 'INDEX') {
      const schema = tbl.name.includes('.') ? tbl.name.split('.')[0] + '.' : ''
      const nn = schema + unq(newName)
      if (findObj(nn)) throw TErr(15335, `Error: The new name '${newName}' is already in use as a object name and would cause a duplicate that is not permitted.`)
      db().run(`ALTER TABLE ${qi(tbl.name)} RENAME TO ${qi(nn)}`)
      for (const r of all(`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'klerr$norm$%' AND tbl_name=${ql(nn)}`)) db().run(`DROP TRIGGER ${qi(r[0])}`)
      try { db().run(`UPDATE sqlite_sequence SET name=${ql(nn)} WHERE name=${ql(tbl.name)}`) } catch (e) { /* нет sqlite_sequence */ }
      refreshTriggers(nn)
      return [caution]
    }
    // переименование ограничения
    for (const o of objects()) {
      if (o.type !== 'table') continue
      const p = parseCreate(String(o.sql))
      const c = p && constraintsOf(p).find(x => x.name.toLowerCase() === target.split('.').pop().toLowerCase())
      if (c) {
        if (c.seg) c.seg.name = newName
        else c.def.name = newName
        rebuild(o.name, p)
        return [caution]
      }
    }
    throw TErr(15248, `Either the parameter @objname is ambiguous or the claimed @objtype (${kind || 'OBJECT'}) is wrong.`)
  }

  function sqlType(c) {
    if (isIdentity(c)) return 'int'
    const h = hiddenInfo(c)
    if (h) {
      if (STRING_TYPES.includes(h.base)) return `${h.base}(${h.a})`
      if (['decimal', 'numeric', 'dec'].includes(h.base)) return `${h.base}(${h.a === null ? 18 : h.a},${h.b === null ? 0 : h.b})`
      if (['datetime2', 'time'].includes(h.base) && h.a !== null) return `${h.base}(${h.a})`
      return h.base
    }
    const t = parseType(c.type)
    if (!t) return (c.type || '').toLowerCase()
    if (STRING_TYPES.includes(t.base) && !t.hasArgs) return `${t.base}(max)`
    return c.type.toLowerCase()
  }

  /** Колонки для Object Explorer и sp_help. */
  function describe(tbl) {
    const p = parsed(tbl)
    if (!p) return []
    const cons = constraintsOf(p)
    const pk = new Set(pkCols(p).map(x => x.toLowerCase()))
    return colsOf(p).map(c => {
      const fk = cons.find(x => x.kind === 'fk' && x.cols.length === 1 && x.cols[0].toLowerCase() === c.name.toLowerCase())
      const def = c.segs.find(s => s.kind === 'default')
      return {
        name: c.name,
        type: sqlType(c),
        pk: pk.has(c.name.toLowerCase()),
        nn: pk.has(c.name.toLowerCase()) || c.segs.some(s => s.kind === 'notnull'),
        identity: isIdentity(c),
        fk: fk ? `${fk.refTable}${fk.refCols.length ? '.' + fk.refCols.join(',') : ''}` : null,
        def: def ? prettyDefault(def.body) : null,
      }
    })
  }

  const prettyDefault = b => b.replace(/^DEFAULT\s+/i, '').replace(/datetime\('now',\s*'localtime'\)/gi, 'getdate()')

  function spHelp(name) {
    if (!name) {
      return [{ set: { cols: ['Name', 'Owner', 'Object_type'], rows: objects().map(o => [o.name.split('.').pop(), o.name.includes('.') ? o.name.split('.')[0] : 'dbo', o.type === 'view' ? 'view' : 'user table']) } }]
    }
    const tbl = findTable(resolveName(name))
    if (!tbl) throw TErr(15009, `The object '${name}' does not exist in database '${dbName()}' or is invalid for this operation.`)
    const p = parsed(tbl)
    const cols = describe(tbl)
    const out = [
      { set: { cols: ['Name', 'Owner', 'Type'], rows: [[tbl.split('.').pop(), tbl.includes('.') ? tbl.split('.')[0] : 'dbo', 'user table']] } },
      { set: { cols: ['Column_name', 'Type', 'Nullable', 'Identity', 'Default'], rows: cols.map(c => [c.name, c.type, c.nn ? 'no' : 'yes', c.identity ? 'yes' : 'no', c.def]) } },
    ]
    const cons = constraintsOf(p)
    const kindName = { pk: 'PRIMARY KEY', unique: 'UNIQUE', fk: 'FOREIGN KEY', check: 'CHECK', default: 'DEFAULT' }
    out.push({
      set: {
        cols: ['constraint_type', 'constraint_name', 'constraint_keys'],
        rows: cons.map(c => [
          c.kind === 'default' ? `DEFAULT on column ${c.col}` : c.kind === 'check' && c.col ? `CHECK on column ${c.col}` : kindName[c.kind],
          c.name,
          c.kind === 'fk' ? `${c.cols.join(', ')} REFERENCES ${dbName()}.${short(c.refTable || '')} (${(c.refCols.length ? c.refCols : []).join(', ')})`
            : c.kind === 'default' ? prettyDefault(c.seg.body)
              : c.kind === 'check' ? (c.seg || c.def).body.replace(/^CHECK\s*/i, '')
                : c.cols.join(', '),
        ]),
      },
    })
    return out
  }

  /* ======================= IF … ELSE ======================= */

  const BODY_START = /^(BEGIN|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|USE|TRUNCATE|PRINT|EXEC|EXECUTE|SET|IF|WITH|RETURN|DECLARE|RAISERROR|THROW)\b/i

  function blockEnd(m, i) {
    // i указывает на BEGIN; ищем парный END (CASE … END тоже учитываем)
    const re = /\b(BEGIN|CASE|END)\b/gi
    re.lastIndex = i
    let d = 0, mt
    while ((mt = re.exec(m))) {
      if (/^END$/i.test(mt[1])) { d--; if (!d) return { s: mt.index, e: mt.index + 3 } } else d++
    }
    return null
  }

  function topElse(m, from) {
    const re = /\b(CASE|END|ELSE)\b/gi
    re.lastIndex = from
    let d = 0, mt
    while ((mt = re.exec(m))) {
      const w = mt[1].toUpperCase()
      if (w === 'CASE') d++
      else if (w === 'END') d = Math.max(0, d - 1)
      else if (d === 0) return mt.index
    }
    return -1
  }

  function parseBody(text, m, i) {
    if (/^BEGIN\b/i.test(m.slice(i))) {
      const be = blockEnd(m, i)
      if (!be) return null
      return { body: text.slice(i + 5, be.s), end: be.e }
    }
    const el = topElse(m, i)
    return { body: text.slice(i, el < 0 ? text.length : el), end: el < 0 ? text.length : el }
  }

  function parseIf(text) {
    const m = mask(text, true)
    let d = 0, i = 2
    for (; i < m.length; i++) {
      const c = m[i]
      if (c === '(') d++
      else if (c === ')') d--
      else if (d === 0 && /[A-Za-z]/.test(c) && !/[\w$#@.]/.test(m[i - 1]) && BODY_START.test(m.slice(i))) break
    }
    if (i >= m.length) return null
    const cond = text.slice(2, i).trim()
    const th = parseBody(text, m, i)
    if (!th) return null
    let rest = m.slice(th.end)
    const lead = rest.match(/^[\s;]*/)[0].length
    let els = null
    if (/^ELSE\b/i.test(rest.slice(lead))) {
      const j = th.end + lead + 4
      let k = j
      while (k < m.length && /\s/.test(m[k])) k++
      if (k >= m.length) return null
      const eb = parseBody(text, m, k)
      if (!eb) return null
      els = eb.body
    }
    return { cond, then: th.body, else: els }
  }

  function evalCond(cond) {
    let c = mapOutside(cond, p => p) // копия
    c = c.replace(/\bDB_ID\s*\(\s*N?'([^']*)'\s*\)/gi, (_, n) => (api.findDb(n) ? '1' : 'NULL'))
    c = c.replace(/\bOBJECT_ID\s*\(\s*N?'([^']*)'\s*(?:,\s*N?'[^']*'\s*)?\)/gi, (_, n) => (findObj(resolveName(n)) ? '1' : 'NULL'))
    c = c.replace(/\bSCHEMA_ID\s*\(\s*N?'([^']*)'\s*\)/gi, (_, n) => (schemas().has(n.toLowerCase()) ? '1' : 'NULL'))
    c = c.replace(/\bCOL_LENGTH\s*\(\s*N?'([^']*)'\s*,\s*N?'([^']*)'\s*\)/gi, (_, t, col) => {
      const tbl = findTable(resolveName(t))
      return tbl && findCol(parsed(tbl), col) ? '1' : 'NULL'
    })
    const sql = api.translate(rewrite(`SELECT CASE WHEN ${c} THEN 1 ELSE 0 END`))
    const r = db().exec(sql)
    return !!(r.length && r[0].values[0][0])
  }

  function runIf(s) {
    const p = parseIf(s)
    if (!p) throw TErr(102, 'Incorrect syntax near the end of the IF statement.')
    const body = evalCond(p.cond) ? p.then : p.else
    if (!body || !body.trim()) return []
    const out = []
    for (const st of group(api.splitStatements(body).map(t => ({ text: t, line: 0 })))) out.push(...run(st.text))
    return out
  }

  /** Склеивает IF/BEGIN…END/ELSE, которые движок разрезал на части. */
  function group(items) {
    const out = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!/^\s*IF\b/i.test(it.text)) { out.push(it); continue }
      let txt = it.text, j = i
      for (;;) {
        const p = parseIf(txt.trim().replace(/;+\s*$/, ''))
        if (!p && j + 1 < items.length) { txt += '\n' + items[++j].text; continue }
        if (p && j + 1 < items.length && /^\s*ELSE\b/i.test(items[j + 1].text)) { txt += '\n' + items[++j].text; continue }
        break
      }
      out.push({ ...it, text: txt })
      i = j
    }
    return out
  }

  /* ======================= ошибки ======================= */

  function targetTable(s) {
    const m = s.match(new RegExp(`^\\s*(?:INSERT\\s+(?:INTO\\s+)?|UPDATE\\s+|DELETE\\s+(?:FROM\\s+)?|ALTER\\s+TABLE\\s+|MERGE\\s+(?:INTO\\s+)?)(${NAME_RE})`, 'i'))
    return m ? findTable(unq(m[1])) || unq(m[1]) : null
  }

  function mapError(e, s) {
    const msg = e && e.message ? e.message : String(e)
    if (e && e.num) return e
    const kind = (s.match(/^\s*(\w+)/) || ['', ''])[1].toUpperCase()
    const tbl = targetTable(s)
    let t
    if ((t = msg.match(/^KLERR\|(\d+)\|([\s\S]*)$/))) {
      return TErr(+t[1], t[2].replace('{table}', tbl ? full(tbl) : dbName()))
    }
    if ((t = msg.match(/UNIQUE constraint failed: (.+)$/))) {
      const items = t[1].split(',').map(x => x.trim())
      const tname = findTable(items[0].slice(0, items[0].lastIndexOf('.'))) || items[0].slice(0, items[0].lastIndexOf('.'))
      const cols = items.map(x => x.slice(x.lastIndexOf('.') + 1).toLowerCase()).sort().join(',')
      const p = findTable(tname) ? parsed(tname) : null
      const c = p ? constraintsOf(p).find(x => (x.kind === 'pk' || x.kind === 'unique') && x.cols.map(y => y.toLowerCase()).sort().join(',') === cols) : null
      const isPk = c ? c.kind === 'pk' : true
      const name = c ? c.name : `PK__${tname.split('.').pop()}`
      return TErr(2627, `Violation of ${isPk ? 'PRIMARY KEY' : 'UNIQUE KEY'} constraint '${name}'. Cannot insert duplicate key in object '${short(tname)}'.`)
    }
    if ((t = msg.match(/CHECK constraint failed: (.+)$/))) {
      return TErr(547, `The ${kind} statement conflicted with the CHECK constraint "${t[1]}". The conflict occurred in database "${dbName()}", table "${short(tbl || '?')}".`)
    }
    if ((t = msg.match(/NOT NULL constraint failed: (.+)\.([^.]+)$/))) {
      const tname = findTable(t[1]) || t[1]
      return TErr(515, `Cannot insert the value NULL into column '${t[2]}', table '${full(tname)}'; column does not allow nulls. ${kind === 'UPDATE' ? 'UPDATE' : 'INSERT'} fails.`)
    }
    if (/FOREIGN KEY constraint failed/.test(msg)) {
      if (kind === 'DELETE' || (kind === 'UPDATE' && tbl && allForeignKeys().some(f => (f.refTable || '').toLowerCase() === tbl.toLowerCase()))) {
        const child = tbl && allForeignKeys().find(f => (f.refTable || '').toLowerCase() === tbl.toLowerCase())
        return TErr(547, `The ${kind} statement conflicted with the REFERENCE constraint "${child ? child.name : 'FK'}". The conflict occurred in database "${dbName()}", table "${child ? short(child.table) : '?'}"${child ? `, column '${child.cols.join(', ')}'` : ''}.`)
      }
      const fk = tbl && findTable(tbl) ? constraintsOf(parsed(findTable(tbl))).filter(c => c.kind === 'fk') : []
      const one = fk.length === 1 ? fk[0] : null
      return TErr(547, `The ${kind} statement conflicted with the FOREIGN KEY constraint "${one ? one.name : 'FK'}". The conflict occurred in database "${dbName()}", table "${one ? short(one.refTable || '') : '?'}"${one && one.refCols.length ? `, column '${one.refCols.join(', ')}'` : ''}.`)
    }
    if ((t = msg.match(/unknown database (\S+)/))) {
      const nm = (s.match(new RegExp(`${t[1].replace(/[^\w]/g, '')}\\s*\\.\\s*(\\[[^\\]]+\\]|\\w+)`, 'i')) || [])[1]
      return TErr(208, `Invalid object name '${t[1]}${nm ? '.' + unq(nm) : ''}'.`)
    }
    if ((t = msg.match(/no such function: (\w+)/i))) return TErr(195, `'${t[1]}' is not a recognized built-in function name.`)
    if (/more than one primary key/.test(msg)) return TErr(8110, `Cannot add multiple PRIMARY KEY constraints to table '${tbl || '?'}'.`)
    if ((t = msg.match(/no such table: (?:main\.)?(.+)/))) return TErr(208, `Invalid object name '${t[1]}'.`)
    return e
  }

  /* ======================= основной вход ======================= */

  function postSet(set, percent) {
    if (percent !== null) set.rows = set.rows.slice(0, Math.ceil(set.rows.length * percent / 100))
    set.cols = set.cols.map(c => (/^[\d.]+$/.test(c) || /[()'+\-*/%|<>=]/.test(c) ? '(No column name)' : c))
    return set
  }

  /** Выполняет один оператор. Возвращает массив { set?, msg? }. */
  function run(raw) {
    let s = raw.trim().replace(/;+\s*$/, '').trim()
    if (!s) return []
    attachFunctions(db(), state)
    try {
      const out = runInner(s)
      for (const r of out) {
        if (r.set) state.rowcount = r.set.rows.length
        else if (r.msg && (r.m = r.msg.match(/^\((\d+) rows? affected\)$/))) state.rowcount = +r.m[1]
        delete r.m
      }
      if (state.nocount) return out.map(r => (r.msg && /rows? affected\)$/.test(r.msg) ? { ...r, msg: null } : r))
      return out
    } catch (e) {
      throw mapError(e, s)
    }
  }

  function runInner(s) {
    let m
    if (/^IF\b/i.test(s)) return runIf(s)
    if (/^ELSE\b/i.test(s)) throw TErr(156, "Incorrect syntax near the keyword 'ELSE'.")
    if ((m = s.match(/^SET\s+NOCOUNT\s+(ON|OFF)$/i))) { state.nocount = /ON/i.test(m[1]); return [] }
    if ((m = s.match(new RegExp(`^SET\\s+IDENTITY_INSERT\\s+(${NAME_RE})\\s+(ON|OFF)$`, 'i')))) {
      const tbl = findTable(resolveName(unq(rewriteNames(m[1]))))
      if (!tbl) throw TErr(1088, `Cannot find the object "${unq(m[1])}" because it does not exist or you do not have permissions.`)
      if (/ON/i.test(m[2])) state.identityInsert.add(tbl.toLowerCase()); else state.identityInsert.delete(tbl.toLowerCase())
      return []
    }

    let percent = null
    s = s.replace(/^(SELECT\s+(?:DISTINCT\s+)?)TOP\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?\s+PERCENT\b/i, (_, a, n) => { percent = +n; return a })
    s = s.replace(/^(SELECT\s+(?:DISTINCT\s+)?TOP\s*\(?\s*\d+\s*\)?)\s+WITH\s+TIES\b/i, '$1')

    // EXEC('…') — динамический SQL из одной строки
    if ((m = s.match(/^EXEC(?:UTE)?\s*\(\s*N?'((?:[^']|'')*)'\s*\)$/i))) {
      const inner = m[1].replace(/''/g, "'")
      const out = []
      for (const st of group(api.splitStatements(inner).map(t => ({ text: t, line: 0 })))) out.push(...run(st.text))
      return out
    }

    const r = schemaStmt(s) || execProc(s)
    if (r) return r

    s = rewrite(s)

    const kw = (s.match(/^(\w+)/) || ['', ''])[1].toUpperCase()
    let handled = null
    if (kw === 'CREATE' && /^CREATE\s+TABLE\b/i.test(s)) handled = createTable(s)
    else if (kw === 'ALTER' && /^ALTER\s+TABLE\b/i.test(s)) handled = alterTable(s)
    else if (kw === 'DROP' && /^DROP\s+TABLE\b/i.test(s)) handled = dropTables(s)
    else if (kw === 'DROP' && /^DROP\s+INDEX\b/i.test(s)) handled = dropIndex(s)
    else if (kw === 'TRUNCATE') handled = truncate(s)
    else if (kw === 'INSERT') {
      const tbl = targetTable(s)
      if (tbl && state.identityInsert.has(tbl.toLowerCase())) {
        if (!/^INSERT\s+(?:INTO\s+)?\S+\s*\(/i.test(s)) throw TErr(8101, `An explicit value for the identity column in table '${tbl}' can only be specified when a column list is used and IDENTITY_INSERT is ON.`)
        db().run(api.translate(s))
        handled = [{ msg: `(${db().getRowsModified()} row${db().getRowsModified() === 1 ? '' : 's'} affected)` }]
      }
    }
    if (handled) return handled

    const res = api.runStatement(s)
    const out = []
    if (res.set) { const set = postSet(res.set, percent); out.push({ set, msg: `(${set.rows.length} row${set.rows.length === 1 ? '' : 's'} affected)` }) }
    else if (res.msg) out.push({ msg: res.msg, changedUI: res.changedUI })
    else if (res.changedUI) out.push({ changedUI: true })
    return out
  }

  /* ======================= пакеты и строки ======================= */

  /** Делит текст на пакеты по GO, помня номер первой строки каждого. */
  function batches(text) {
    const clean = stripCommentsKeepLines(text)
    const lines = clean.split(/\r?\n/)
    const out = []
    let cur = [], start = 0
    const push = (repeat) => {
      const t = cur.join('\n')
      if (t.trim()) out.push({ text: t, line: start, repeat })
    }
    lines.forEach((line, i) => {
      const g = line.match(/^\s*GO(?:\s+(\d+))?\s*;?\s*$/i)
      if (g) { push(g[1] ? Math.min(+g[1], 1000) : 1); cur = []; start = i + 1 } else cur.push(line)
    })
    push(1)
    return out
  }

  /** Операторы пакета с номерами строк (0-based, от начала текста). */
  function statements(batch) {
    const parts = api.splitStatements(batch.text)
    let cursor = 0
    const items = parts.map(p => {
      const probe = p.slice(0, 60)
      let pos = batch.text.indexOf(probe, cursor)
      if (pos < 0) pos = cursor
      cursor = pos + Math.max(1, p.length - 1)
      return { text: p, line: batch.line + (batch.text.slice(0, pos).match(/\n/g) || []).length }
    })
    return group(items)
  }

  function reset() {
    state.nocount = false
    state.identityInsert.clear()
  }

  return {
    run, batches, statements, describe, reset, state,
    attach: d => attachFunctions(d, state),
  }
}

/* ======================= подсказки ======================= */

/** Подсказка на русском к сообщению об ошибке (или null). */
export function hintFor(message, stmt, current) {
  const s = stmt || ''
  const num = +((message.match(/^Msg (\d+)/) || [])[1] || 0)
  const has = re => re.test(mask(s))
  if (has(/\bLIMIT\b/i)) return 'В SQL Server нет LIMIT. Пиши SELECT TOP (5) … или ORDER BY … OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY.'
  if (has(/\bAUTO_?INCREMENT\b/i)) return 'Автоувеличение в SQL Server задаётся так: Id INT IDENTITY(1,1) PRIMARY KEY.'
  if (has(/\|\|/)) return 'Строки в SQL Server склеиваются через + или CONCAT(a, b), а не ||.'
  if (/'LENGTH'/.test(message)) return 'Длина строки в SQL Server — LEN(текст).'
  if (/'NOW'|'CURDATE'|'CURTIME'/.test(message)) return 'Текущие дата и время в SQL Server — GETDATE().'
  if (/'IFNULL'/.test(message)) return 'Вместо IFNULL в SQL Server используют ISNULL(x, 0) или COALESCE(x, 0).'
  if (/'SUBSTR'/.test(message)) return 'В SQL Server функция называется SUBSTRING(текст, начало, длина).'
  if (/'GROUP_CONCAT'/.test(message)) return 'В SQL Server склейка строк группы — STRING_AGG (в тренажёре пока не поддерживается).'
  if (/'RENAME'/.test(message)) return 'Переименование в SQL Server: EXEC sp_rename \'Таблица.Колонка\', \'НовоеИмя\', \'COLUMN\'; или EXEC sp_rename \'Таблица\', \'НоваяТаблица\'.'
  switch (num) {
    case 208: return `Такой таблицы нет в текущей базе (${current}). Проверь имя, выбери базу командой USE или в списке «БД», или сначала создай таблицу.`
    case 207: {
      const col = (message.match(/'([^']+)'/) || [])[1]
      if (col && new RegExp(`"${col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(s)) return `Текст пишут в одинарных кавычках: '${col}'. Двойные кавычки и [квадратные скобки] — для имён колонок и таблиц.`
      return 'Такой колонки нет. Список колонок виден в Object Explorer слева — раскрой таблицу.'
    }
    case 2714: return 'Объект с таким именем уже есть. Удали его (DROP TABLE …) или выбери другое имя.'
    case 1801: return 'База уже создана — просто переключись на неё: USE ИмяБазы.'
    case 911: return 'Сначала создай базу: CREATE DATABASE ИмяБазы; затем GO и USE ИмяБазы.'
    case 3702: return 'Нельзя удалить базу, в которой сейчас работаешь. Сначала USE master; затем DROP DATABASE.'
    case 2627: return 'Первичный ключ (или UNIQUE) не допускает повторов — запись с таким значением уже есть.'
    case 547: return /REFERENCE/.test(message)
      ? 'На эту строку ссылаются записи другой таблицы. Сначала удали или измени их, потом удаляй строку.'
      : /CHECK/.test(message)
        ? 'Значение нарушает правило CHECK этой таблицы.'
        : 'Внешний ключ: значение должно уже существовать в родительской таблице.'
    case 515: return 'Колонка объявлена NOT NULL — для неё нужно указать значение.'
    case 544: case 8101: return 'Колонку IDENTITY база заполняет сама — убери её из списка колонок INSERT.'
    case 8102: return 'Значение IDENTITY-колонки менять нельзя.'
    case 213: case 109: case 110: return 'Количество значений в VALUES должно совпадать с количеством колонок.'
    case 2628: return 'Строка длиннее, чем разрешает тип VARCHAR(n). Сократи значение или увеличь размер: ALTER TABLE … ALTER COLUMN … VARCHAR(100).'
    case 220: case 8115: return 'Число не помещается в тип. TINYINT: 0…255, SMALLINT: −32 768…32 767, INT: ±2 147 483 647, DECIMAL(p,s): до p цифр, из них s после запятой.'
    case 245: case 8114: return 'В числовую колонку попал текст. Числа пишут без кавычек: 14, а не \'четырнадцать\'.'
    case 241: return 'Дату пиши в формате \'ГГГГ-ММ-ДД\', например \'2025-07-18\', время — \'2025-07-18 14:30:00\'.'
    case 242: return 'Дата вне диапазона типа: SMALLDATETIME — 1900-01-01…2079-06-06, DATETIME — с 1753-01-01, DATE/DATETIME2 — 0001…9999.'
    case 206: return 'В колонку даты попало число. Дату пиши строкой в кавычках: \'2025-07-18\'.'
    case 2760: return 'Сначала создай схему: CREATE SCHEMA ИмяСхемы; затем GO.'
    case 3726: case 4712: return 'На таблицу ссылается внешний ключ другой таблицы. Сначала удали дочернюю таблицу или её FOREIGN KEY.'
    case 5074: return 'Колонку используют ограничения (ключи, DEFAULT, CHECK). Сначала удали их: ALTER TABLE … DROP CONSTRAINT имя.'
    case 8111: return 'Колонки первичного ключа должны быть NOT NULL: ALTER TABLE … ALTER COLUMN … INT NOT NULL; затем добавляй PRIMARY KEY.'
    case 1779: return 'Первичный ключ у таблицы может быть только один.'
    case 1776: case 1767: return 'Внешний ключ должен ссылаться на PRIMARY KEY (или UNIQUE) существующей таблицы.'
    case 3728: return 'Ограничения с таким именем нет. Имена ограничений покажет EXEC sp_help \'Таблица\'.'
    case 4901: return 'В непустую таблицу можно добавить только колонку, допускающую NULL, или с DEFAULT.'
    case 195: return 'Такой функции нет в SQL Server (или в тренажёре).'
    case 155: return 'Первый аргумент — часть даты: YEAR, MONTH, DAY, HOUR, MINUTE, SECOND…'
    case 40000: return null
    case 102: case 156: {
      const near = (message.match(/near '([^']*)'/) || [])[1]
      if (near === ')' && has(/,\s*\)/)) return 'Похоже, перед закрывающей скобкой лишняя запятая.'
      if (has(/"[^"]*"/) && !has(/\[/)) return 'Строки пишут в одинарных кавычках: \'текст\'.'
      if (/incomplete/.test(message)) return 'Оператор оборван: проверь закрывающие скобки и кавычки.'
      return 'Синтаксическая ошибка рядом с указанным словом: проверь запятые, скобки и порядок ключевых слов.'
    }
  }
  return null
}
