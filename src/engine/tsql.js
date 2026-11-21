/**
 * Klerr — движок T-SQL поверх SQLite (sql.js).
 *
 * ВАЖНО: блоки helpers / parsing / T-SQL→SQLite / validation / runStatement
 * перенесены из прежнего sql-trainer.html БЕЗ единой правки — только перемещены
 * внутрь фабрики createEngine(). Идентичность проверяется сверкой хэшей
 * (scripts/verify-engine.mjs).
 *
 * Из прежнего файла изменён только слой оркестровки: execute() больше не
 * пишет в DOM, а возвращает данные для Vue-компонентов.
 */

const LS_DBS = 'tsqltr_dbs', LS_CUR = 'tsqltr_cur', LS_TXT = 'tsql_txt';
export const MAX_ROWS = 1000;

export function createEngine({ locateFile } = {}) {
  let SQL = null;
  let dbs = {};
  let current = 'master';
  const openKeys = new Set(['db:master']);

  /* ==== БЛОК 1 — без изменений: helpers, парсинг, T-SQL→SQLite, валидация ==== */
function TErr(num, msg) { const e = new Error(msg); e.num = num; return e; }
function findDb(name) { return Object.keys(dbs).find(k => k.toLowerCase() === String(name).toLowerCase()) || null; }
function db() { return dbs[current]; }
function newDb() { const d = new SQL.Database(); d.run('PRAGMA foreign_keys=ON'); return d; }

const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

function save() {
  try {
    const o = {};
    for (const n in dbs) { o[n] = toB64(dbs[n].export()); dbs[n].run('PRAGMA foreign_keys=ON'); }
    localStorage.setItem(LS_DBS, JSON.stringify(o));
    localStorage.setItem(LS_CUR, current);
  } catch (e) { /* хранилище недоступно или переполнено — не критично */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(LS_DBS);
    if (raw) {
      const o = JSON.parse(raw);
      for (const n in o) { dbs[n] = new SQL.Database(fromB64(o[n])); dbs[n].run('PRAGMA foreign_keys=ON'); }
    }
    const c = localStorage.getItem(LS_CUR);
    if (c && dbs[c]) current = c;
    const t = localStorage.getItem(LS_TXT);
    if (t) editor.value = t;
  } catch (e) { dbs = {}; }
}

/* ===================== парсинг скрипта ===================== */
function stripComments(s) {
  let out = '', i = 0, q = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) { out += c; if (c === "'") { if (n === "'") { out += n; i += 2; continue; } q = false; } i++; continue; }
    if (c === "'") { q = true; out += c; i++; continue; }
    if (c === '-' && n === '-') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}

function splitBatches(text) {
  const batches = []; let cur = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*GO(?:\s+\d+)?\s*;?\s*$/i.test(line)) { batches.push(cur.join('\n')); cur = []; }
    else cur.push(line);
  }
  batches.push(cur.join('\n'));
  return batches.filter(b => b.trim());
}

const START = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|USE|SELECT|TRUNCATE|EXEC|EXECUTE|PRINT|DECLARE|SET|WITH)\b/i;

function shouldSplit(cur, kw) {
  const u = cur.trim().toUpperCase();
  if (kw === 'SELECT') {
    if (/^(INSERT|CREATE\s+VIEW)/.test(u) && !/\bSELECT\b/.test(u) && !/\bVALUES\b/.test(u)) return false;
    if (/(UNION(\s+ALL)?|INTERSECT|EXCEPT|\bAS)$/.test(u)) return false;
    return true;
  }
  if (kw === 'SET') return !(/^UPDATE\b/.test(u) && !/\bSET\b/.test(u));
  if (kw === 'DROP') return !/^ALTER\b/.test(u);
  return true;
}

function splitStatements(b) {
  const out = []; let cur = '', q = false, depth = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i]; cur += c;
    if (c === "'") { q = !q; continue; }
    if (q) continue;
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { out.push(cur); cur = ''; }
    else if (c === '\n' && depth === 0 && cur.trim()) {
      const m = b.slice(i + 1).match(START);
      if (m && shouldSplit(cur, m[1].toUpperCase())) { out.push(cur); cur = ''; }
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

/* ===================== T-SQL → SQLite ===================== */
function mapOutside(sql, fn) {
  const parts = sql.split(/('(?:[^']|'')*')/);
  return parts.map((p, i) => i % 2 ? p : fn(p, i, parts.length)).join('');
}

function translate(sql) {
  sql = sql.replace(/(^|[^\w])N'/g, "$1'");
  sql = mapOutside(sql, (p, i, L) => {
    if (i > 0 && /^\s*\+/.test(p)) p = p.replace('+', '||');
    if (i < L - 1 && /\+\s*$/.test(p)) p = p.replace(/\+(\s*)$/, '||$1');
    p = p.replace(/\[([^\]]+)\]/g, '"$1"');
    p = p.replace(/\bdbo\s*\./gi, '');
    p = p.replace(/\bDEFAULT\s+GETDATE\s*\(\s*\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
    p = p.replace(/\b(?:GETDATE|SYSDATETIME)\s*\(\s*\)/gi, "datetime('now')");
    p = p.replace(/\bDB_NAME\s*\(\s*\)/gi, "'" + current.replace(/'/g, "''") + "'");
    p = p.replace(/\bLEN\s*\(/gi, 'LENGTH(');
    p = p.replace(/\bISNULL\s*\(/gi, 'IFNULL(');
    p = p.replace(/\(\s*MAX\s*\)/gi, '');
    p = p.replace(/\b(?:NON)?CLUSTERED\b/gi, '');
    p = p.replace(/\b(?:BIG|SMALL|TINY)?INT(?:EGER)?\s+(?:NOT\s+NULL\s+)?PRIMARY\s+KEY\s+IDENTITY\s*(?:\([^)]*\))?/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    p = p.replace(/\b(?:BIG|SMALL|TINY)?INT(?:EGER)?\s+IDENTITY\s*(?:\([^)]*\))?(\s+NOT\s+NULL)?(\s+PRIMARY\s+KEY)?/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    p = p.replace(/OFFSET\s+(\d+)\s+ROWS?\s+FETCH\s+(?:NEXT|FIRST)\s+(\d+)\s+ROWS?\s+ONLY/gi, 'LIMIT $2 OFFSET $1');
    return p;
  });
  sql = sql.replace(/^\s*DELETE\s+(?!FROM\b)/i, 'DELETE FROM ');
  sql = sql.replace(/^\s*INSERT\s+(?!INTO\b)/i, 'INSERT INTO ');
  sql = sql.replace(/^(\s*ALTER\s+TABLE\s+\S+\s+ADD\s+)(?!COLUMN\b|CONSTRAINT\b)/i, '$1COLUMN ');
  let limit = null;
  sql = sql.replace(/^(\s*SELECT\s+(?:DISTINCT\s+)?)TOP\s*\(?\s*(\d+)\s*\)?\s+/i, (_, a, n) => { limit = n; return a; });
  if (limit !== null) sql = sql.replace(/;?\s*$/, '') + ' LIMIT ' + limit;
  return sql;
}

function fmtErr(e) {
  const m = e && e.message ? e.message : String(e);
  if (e && e.num) return `Msg ${e.num}, Level 16, State 1\n${m}`;
  let t;
  if ((t = m.match(/no such table: (?:main\.)?(.+)/))) return `Msg 208, Level 16, State 1\nInvalid object name '${t[1]}'.`;
  if ((t = m.match(/no such column: (.+)/))) return `Msg 207, Level 16, State 1\nInvalid column name '${t[1].split('.').pop()}'.`;
  if ((t = m.match(/table "?([^"]+?)"? already exists/))) return `Msg 2714, Level 16, State 1\nThere is already an object named '${t[1]}' in the database.`;
  if ((t = m.match(/NOT NULL constraint failed: ([^.]+)\.(.+)/))) return `Msg 515, Level 16, State 2\nCannot insert the value NULL into column '${t[2]}', table '${t[1]}'; column does not allow nulls. INSERT fails.`;
  if ((t = m.match(/UNIQUE constraint failed: ([^.]+)\./))) return `Msg 2627, Level 14, State 1\nViolation of PRIMARY KEY or UNIQUE constraint. Cannot insert duplicate key in object 'dbo.${t[1]}'.`;
  if (/FOREIGN KEY constraint failed/.test(m)) return `Msg 547, Level 16, State 0\nThe statement conflicted with the FOREIGN KEY constraint.`;
  if ((t = m.match(/table (\S+) has (\d+) columns but (\d+) values/))) return `Msg 213, Level 16, State 1\nColumn name or number of supplied values does not match table definition.`;
  if ((t = m.match(/(\d+) values for (\d+) columns/))) {
    return +t[1] > +t[2]
      ? `Msg 110, Level 15, State 1\nThere are fewer columns in the INSERT statement than values specified in the VALUES clause. The number of values in the VALUES clause must match the number of columns specified in the INSERT statement.`
      : `Msg 109, Level 15, State 1\nThere are more columns in the INSERT statement than values specified in the VALUES clause. The number of values in the VALUES clause must match the number of columns specified in the INSERT statement.`;
  }
  if ((t = m.match(/near "([^"]*)": syntax error/))) return `Msg 102, Level 15, State 1\nIncorrect syntax near '${t[1]}'.`;
  if (/incomplete input/.test(m)) return `Msg 102, Level 15, State 1\nIncorrect syntax: the statement is incomplete.`;
  return `Msg 50000, Level 16, State 1\n${m}`;
}

/* ===================== проверка T-SQL-синтаксиса ===================== */
/*VALIDATE-START*/
const ALLOWED_FIRST = ['SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'USE', 'TRUNCATE', 'PRINT', 'SET', 'EXEC', 'EXECUTE', 'DECLARE'];
const NOT_SUPPORTED = ['IF', 'WHILE', 'MERGE', 'GRANT', 'REVOKE', 'DENY', 'BACKUP', 'RESTORE', 'RETURN', 'GOTO', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVE', 'OPEN', 'FETCH', 'CLOSE', 'DEALLOCATE', 'CHECKPOINT', 'DBCC', 'KILL', 'WAITFOR', 'RAISERROR', 'THROW'];
const T_LEN = ['char', 'varchar', 'nchar', 'nvarchar', 'binary', 'varbinary'];
const T_NUM = ['decimal', 'numeric', 'dec'];
const T_ARG1 = ['float', 'time', 'datetime2', 'datetimeoffset'];
const T_NOARG = ['int', 'integer', 'bigint', 'smallint', 'tinyint', 'bit', 'date', 'datetime', 'smalldatetime', 'money', 'smallmoney', 'real', 'text', 'ntext', 'image', 'uniqueidentifier', 'xml', 'timestamp', 'rowversion', 'sql_variant'];
const T_KNOWN = [].concat(T_LEN, T_NUM, T_ARG1, T_NOARG);

function maskStrings(s) { return s.replace(/'(?:[^']|'')*'/g, x => "'" + ' '.repeat(x.length - 2) + "'"); }

function splitTop(str) {
  const out = []; let cur = '', q = false, d = 0;
  for (const c of str) {
    if (c === "'") { q = !q; cur += c; continue; }
    if (!q) {
      if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += c;
  }
  if (cur.trim() || out.length) out.push(cur);
  return out;
}

const stripId = x => x.trim().replace(/^[\["]|[\]"]$/g, '');

function validateCreateTable(body) {
  const defs = splitTop(body);
  if (!defs.length) throw TErr(102, "Incorrect syntax near ')'.");
  let n = 0;
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i].trim();
    const last = i === defs.length - 1;
    const near = last ? ')' : ',';
    if (!def) throw TErr(102, `Incorrect syntax near '${near}'.`);
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(def)) continue;
    n++;
    const mm = def.match(/^(\[[^\]]+\]|"[^"]*"|\w+)\s*([\s\S]*)$/);
    if (!mm) throw TErr(102, `Incorrect syntax near '${def[0]}'.`);
    const name = stripId(mm[1]), rest = mm[2].trim();
    if (!rest) throw TErr(102, `Incorrect syntax near '${near}'.`);
    if (/^AS\b/i.test(rest)) continue;
    const tm = rest.match(/^(\w+)\s*(?:\(([^)]*)\))?/);
    if (!tm) throw TErr(102, `Incorrect syntax near '${rest[0]}'.`);
    const type = tm[1].toLowerCase();
    const args = tm[2] !== undefined ? tm[2].split(',').map(x => x.trim()) : null;
    if (!T_KNOWN.includes(type)) throw TErr(2715, `Column, parameter, or variable #${n}: Cannot find data type ${tm[1]}.`);
    if (!args) continue;
    if (T_NOARG.includes(type)) throw TErr(2716, `Column, parameter, or variable #${n}: Cannot specify a column width on data type ${type}.`);
    if (T_LEN.includes(type)) {
      if (args.length > 1) throw TErr(102, "Incorrect syntax near ','.");
      if (!/^max$/i.test(args[0])) {
        if (!/^\d+$/.test(args[0])) throw TErr(102, `Incorrect syntax near '${args[0] || ')'}'.`);
        const lim = /^n/.test(type) ? 4000 : 8000, v = +args[0];
        if (v > lim) throw TErr(131, `The size (${v}) given to the column '${name}' exceeds the maximum allowed for any data type (${lim}).`);
      }
    } else if (T_NUM.includes(type)) {
      if (args.length > 2) throw TErr(102, "Incorrect syntax near ','.");
    } else if (T_ARG1.includes(type) && args.length > 1) {
      throw TErr(102, "Incorrect syntax near ','.");
    }
  }
}

function validateTsql(s, ctx) {
  const m = maskStrings(s);
  let t;
  const fw = (m.match(/^\s*(\w+)/) || ['', ''])[1].toUpperCase();
  const fullFirst = (s.match(/^\s*(\S+)/) || ['', ''])[1];
  if (NOT_SUPPORTED.includes(fw)) throw TErr(40000, `${fw} is not supported in this trainer.`);
  if (!ALLOWED_FIRST.includes(fw)) throw TErr(102, `Incorrect syntax near '${fullFirst}'.`);

  if ((t = m.match(/\b(LIMIT|AUTO_?INCREMENT|ILIKE|UNSIGNED)\b/i))) throw TErr(102, `Incorrect syntax near '${t[1]}'.`);
  if (/\|\|/.test(m)) throw TErr(102, "Incorrect syntax near '|'.");
  if ((t = m.match(/\b(LENGTH|IFNULL|SUBSTR|INSTR|RANDOM|NOW|CURDATE|CURTIME|STRFTIME|GROUP_CONCAT|TYPEOF)\s*\(/i))) {
    throw TErr(195, `'${t[1].toUpperCase()}' is not a recognized built-in function name.`);
  }

  if (/^(SELECT|WITH|INSERT|UPDATE|DELETE)$/.test(fw)) {
    const re = /"([^"]*)"/g; let q;
    while ((q = re.exec(m))) {
      if (/\bAS\s*$/i.test(m.slice(0, q.index))) continue;
      if (ctx.hasTable(q[1]) || ctx.hasColumn(q[1])) continue;
      throw TErr(207, `Invalid column name '${q[1]}'.`);
    }
  }

  if (fw === 'CREATE') {
    if (/^\s*CREATE\s+(TEMP|TEMPORARY|VIRTUAL)\b/i.test(m)) throw TErr(102, `Incorrect syntax near '${(s.match(/^\s*CREATE\s+(\w+)/i) || ['', ''])[1]}'.`);
    if (/^\s*CREATE\s+(TABLE|DATABASE|VIEW|INDEX)\s+IF\b/i.test(m)) throw TErr(156, "Incorrect syntax near the keyword 'IF'.");
    if (/^\s*CREATE\s+TABLE\s+\S+\s+AS\b/i.test(m)) throw TErr(156, "Incorrect syntax near the keyword 'AS'.");
    const cm = m.match(/^\s*CREATE\s+TABLE\s+[^(]+\(([\s\S]*)\)\s*$/i);
    if (cm) validateCreateTable(cm[1]);
  }

  if (fw === 'INSERT') {
    const im = m.match(/^\s*INSERT\s+(?:INTO\s+)?(?:\[?dbo\]?\s*\.\s*)?[\["]?(\w+)[\]"]?\s*(?:\(([^)]*)\))?\s*(VALUES|SELECT|DEFAULT)\b/i);
    const idc = im ? ctx.identity(im[1]) : null;
    if (idc) {
      if (im[2] !== undefined) {
        const cols = im[2].split(',').map(x => stripId(x).toLowerCase());
        if (cols.includes(idc.toLowerCase())) throw TErr(544, `Cannot insert explicit value for identity column in table '${im[1]}' when IDENTITY_INSERT is set to OFF.`);
      } else if (im[3].toUpperCase() === 'VALUES') {
        const p = m.indexOf('(', m.search(/\bVALUES\b/i) + 6);
        let d = 0, e = -1;
        for (let i = p; p >= 0 && i < m.length; i++) {
          if (m[i] === '(') d++;
          else if (m[i] === ')') { d--; if (!d) { e = i; break; } }
        }
        if (e > 0 && splitTop(m.slice(p + 1, e)).length === ctx.colCount(im[1])) {
          throw TErr(8101, `An explicit value for the identity column in table '${im[1]}' can only be specified when a column list is used and IDENTITY_INSERT is ON.`);
        }
      }
    }
  }

  if (fw === 'UPDATE') {
    const um = m.match(/^\s*UPDATE\s+(?:\[?dbo\]?\s*\.\s*)?[\["]?(\w+)[\]"]?\s+SET\s+([\s\S]*)$/i);
    const idc = um ? ctx.identity(um[1]) : null;
    if (idc) {
      for (const a of splitTop(um[2].split(/\bWHERE\b/i)[0])) {
        const lm = a.match(/^\s*[\["]?(\w+)[\]"]?\s*=/);
        if (lm && lm[1].toLowerCase() === idc.toLowerCase()) throw TErr(8102, `Cannot update identity column '${idc}'.`);
      }
    }
  }
}
/*VALIDATE-END*/

function identityCol(d, t) {
  if (!/^\w+$/.test(t)) return null;
  try {
    const r = d.exec("SELECT sql FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + t + "')");
    if (!r.length || !/AUTOINCREMENT/i.test(String(r[0].values[0][0]))) return null;
    const pk = columns(d, t).find(c => c.pk);
    return pk ? pk.name : null;
  } catch (e) { return null; }
}

function makeCtx() {
  const d = db();
  let objs = null;
  const getObjs = () => objs || (objs = listObjects(d));
  return {
    hasTable: n => getObjs().some(o => o.name.toLowerCase() === n.toLowerCase()),
    hasColumn: n => getObjs().some(o => columns(d, o.name).some(c => c.name.toLowerCase() === n.toLowerCase())),
    identity: t => identityCol(d, t),
    colCount: t => columns(d, t).length
  };
}

  /* ==== БЛОК 2 — без изменений: evalExpr, rowsMsg, runStatement ==== */
function evalExpr(expr) {
  const st = db().prepare('SELECT ' + translate(expr));
  try { st.step(); const v = st.get()[0]; return v === null ? 'NULL' : String(v); } finally { st.free(); }
}

function rowsMsg(n) { return `(${n} row${n === 1 ? '' : 's'} affected)`; }

function runStatement(raw) {
  const s = raw.trim().replace(/;+\s*$/, '').trim();
  if (!s) return {};
  let m;

  if ((m = s.match(/^USE\s+\[?(\w+)\]?\s*$/i))) {
    const k = findDb(m[1]);
    if (!k) throw TErr(911, `Database '${m[1]}' does not exist. Make sure that the name is entered correctly.`);
    current = k; openKeys.add('db:' + k);
    return { msg: 'Commands completed successfully.', changedUI: true };
  }
  if ((m = s.match(/^CREATE\s+DATABASE\s+\[?(\w+)\]?/i))) {
    if (findDb(m[1])) throw TErr(1801, `Database '${m[1]}' already exists. Choose a different database name.`);
    dbs[m[1]] = newDb();
    return { msg: 'Commands completed successfully.', changedUI: true };
  }
  if ((m = s.match(/^DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?\[?(\w+)\]?\s*$/i))) {
    const k = findDb(m[1]);
    if (!k) {
      if (/IF\s+EXISTS/i.test(s)) return { msg: 'Commands completed successfully.' };
      throw TErr(3701, `Cannot drop the database '${m[1]}', because it does not exist or you do not have permission.`);
    }
    if (k.toLowerCase() === 'master') throw TErr(3701, `Cannot drop the system database 'master'.`);
    if (k === current) throw TErr(3702, `Cannot drop database "${k}" because it is currently in use.`);
    dbs[k].close(); delete dbs[k];
    return { msg: 'Commands completed successfully.', changedUI: true };
  }
  if (/^SET\s+\w+(\s+\w+)?\s+(ON|OFF)\s*$/i.test(s)) return {};
  if ((m = s.match(/^PRINT\s+([\s\S]+)$/i))) return { msg: evalExpr(m[1]) };
  if (/^(EXEC|EXECUTE|DECLARE)\b/i.test(s)) throw TErr(40000, 'EXEC and DECLARE are not supported in this trainer.');
  if (/^ALTER\s+TABLE[\s\S]+\bALTER\s+COLUMN\b/i.test(s)) throw TErr(40000, 'ALTER COLUMN is not supported in this trainer. Use ADD or DROP COLUMN.');
  if ((m = s.match(/^TRUNCATE\s+TABLE\s+(.+)$/i))) {
    db().run('DELETE FROM ' + translate(m[1]));
    return { msg: 'Commands completed successfully.' };
  }

  validateTsql(s, makeCtx());
  const sql = translate(s);

  if (/^(SELECT|WITH)\b/i.test(sql)) {
    const st = db().prepare(sql);
    const rows = [];
    let cols;
    try { cols = st.getColumnNames(); while (st.step()) rows.push(st.get()); } finally { st.free(); }
    return { set: { cols, rows }, msg: rowsMsg(rows.length) };
  }

  db().run(sql);
  const first = (s.match(/^\w+/) || [''])[0].toUpperCase();
  if (first === 'INSERT' || first === 'UPDATE' || first === 'DELETE') return { msg: rowsMsg(db().getRowsModified()) };
  return { msg: 'Commands completed successfully.' };
}

  /* ==== БЛОК 3 — без изменений: listObjects, columns ==== */
function listObjects(d) {
  try {
    const r = d.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return r.length ? r[0].values.map(v => ({ name: v[0], type: v[1] })) : [];
  } catch (e) { return []; }
}
function columns(d, t) {
  try {
    const r = d.exec('PRAGMA table_info("' + t.replace(/"/g, '""') + '")');
    return r.length ? r[0].values.map(v => ({ name: v[1], type: v[2], nn: v[3], pk: v[5] })) : [];
  } catch (e) { return []; }
}

  /* ==== БЛОК 4 — без изменений: SAMPLE ==== */
const SAMPLE = `-- Пример: первый урок
CREATE DATABASE School
GO

USE School
GO

CREATE TABLE Students (
  Id INT IDENTITY(1,1) PRIMARY KEY,
  FirstName NVARCHAR(50) NOT NULL,
  LastName NVARCHAR(50) NOT NULL,
  Age INT
)
GO

INSERT INTO Students (FirstName, LastName, Age)
VALUES (N'Ion', N'Rusu', 17),
       (N'Maria', N'Popa', 16),
       (N'Andrei', N'Ceban', 18)
GO

SELECT * FROM Students
SELECT TOP 2 FirstName, LastName FROM Students ORDER BY Age DESC
`;

  /* ==== Адаптированный слой: DOM → данные (единственная переписанная часть) ==== */

  /* Добавлено при переносе в Vue, строго после блоков движка (1–4).
     SQLite не поддерживает ALTER TABLE … ADD CONSTRAINT, поэтому внешний ключ
     добавляется пересборкой таблицы — так же, как это делает сам SQL Server.
     Трансляция T-SQL, валидация и исполнение остались нетронутыми. */

  const FK_ADD_RE = /^\s*ALTER\s+TABLE\s+(?:\[?[\w]+\]?\s*\.\s*)?(\[?[\w]+\]?)\s+ADD\s+(?:CONSTRAINT\s+(\[?[\w]+\]?)\s+)?FOREIGN\s+KEY\s*\(\s*([^)]*?)\s*\)\s+REFERENCES\s+(?:\[?[\w]+\]?\s*\.\s*)?(\[?[\w]+\]?)\s*\(\s*([^)]*?)\s*\)\s*$/i;

  const ident = s => String(s).trim().replace(/^\[|\]$/g, '').replace(/^["`]|["`]$/g, '');
  const quoteId = s => '"' + ident(s).replace(/"/g, '""') + '"';

  function tableExists(d, name) {
    const r = d.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + ident(name).replace(/'/g, "''") + "')");
    return r.length > 0;
  }

  function addForeignKey(raw) {
    const m = raw.match(FK_ADD_RE);
    if (!m) return false;

    const d = db();
    const tbl = ident(m[1]);
    const cname = m[2] ? ident(m[2]) : 'FK_' + tbl + '_' + ident(m[4]);
    const fkCols = m[3].split(',').map(ident);
    const refTbl = ident(m[4]);
    const refCols = m[5].split(',').map(ident);

    if (!tableExists(d, tbl)) throw TErr(3701, `Cannot update the object '${tbl}' because it does not exist.`);
    if (!tableExists(d, refTbl)) throw TErr(1776, `Foreign key '${cname}' references table '${refTbl}' which does not exist.`);

    const info = d.exec('PRAGMA table_info(' + quoteId(tbl) + ')');
    if (!info.length) throw TErr(3701, `Cannot update the object '${tbl}' because it does not exist.`);
    const cols = info[0].values.map(r => ident(r[1]));

    for (const c of fkCols) {
      if (!cols.some(x => x.toLowerCase() === c.toLowerCase())) {
        throw TErr(1750, `Column '${c}' in table '${tbl}' is not a valid column or cannot be used in this context.`);
      }
    }

    const row = d.exec("SELECT sql FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + tbl.replace(/'/g, "''") + "')");
    const createSql = String(row[0].values[0][0]);
    const close = createSql.lastIndexOf(')');
    const fk = ', FOREIGN KEY (' + fkCols.map(quoteId).join(', ') + ') REFERENCES ' + quoteId(refTbl) + ' (' + refCols.map(quoteId).join(', ') + ')';
    const withFk = createSql.slice(0, close) + fk + createSql.slice(close);

    const tmp = '__fk_' + tbl;
    const tmpSql = withFk.replace(
      /^(CREATE\s+TABLE\s+)(?:IF\s+NOT\s+EXISTS\s+)?("[^"]+"|\[[^\]]+\]|`[^`]+`|\w+)/i,
      '$1' + quoteId(tmp),
    );
    const colList = cols.map(quoteId).join(', ');

    d.run('PRAGMA foreign_keys=OFF');
    try {
      d.run(tmpSql);
      d.run('INSERT INTO ' + quoteId(tmp) + ' (' + colList + ') SELECT ' + colList + ' FROM ' + quoteId(tbl));
      d.run('DROP TABLE ' + quoteId(tbl));
      d.run('PRAGMA legacy_alter_table=ON');
      try {
        d.run('ALTER TABLE ' + quoteId(tmp) + ' RENAME TO ' + quoteId(tbl));
      } finally {
        d.run('PRAGMA legacy_alter_table=OFF');
      }
    } finally {
      d.run('PRAGMA foreign_keys=ON');
    }
    return true;
  }

  function execute(text, opts) {
    if (!SQL) return { sets: [], log: [], hadErr: false, ms: 0 };
    if (!text || !text.trim()) return { sets: [], log: [], hadErr: false, ms: 0, empty: true };

    const usedSel = !!(opts && opts.selectionOnly);
    const t0 = performance.now();
    const sets = [], log = [];
    let hadErr = false;

    if (usedSel) log.push({ t: 'dim', m: '-- Выполнено только выделенное --' });

    for (const batch of splitBatches(stripComments(text))) {
      for (const stmt of splitStatements(batch)) {
        try {
          const raw = stmt.trim().replace(/;+\s*$/, '').trim();
          const r = addForeignKey(raw)
            ? { msg: 'Commands completed successfully.', changedUI: true }
            : runStatement(stmt);
          if (r.set) sets.push(r.set);
          if (r.msg) log.push({ t: 'ok', m: r.msg });
        } catch (e) {
          log.push({ t: 'err', m: fmtErr(e) });
          hadErr = true;
          break; // как в SSMS: ошибка прерывает текущий пакет, следующий (посде GO) продолжится
        }
      }
    }

    const ms = Math.max(1, Math.round(performance.now() - t0));
    log.push({ t: 'dim', m: `Completion time: ${new Date().toLocaleTimeString()}` });

    save();
    return { sets, log, hadErr, ms };
  }

  async function init(initSqlJs) {
    if (typeof initSqlJs !== 'function') throw new Error('Не удалось загрузить движок sql.js');
    SQL = await initSqlJs({ locateFile });
    restore();
    if (!dbs.master) dbs.master = newDb();
    if (!dbs[current]) current = 'master';
    openKeys.add('db:' + current);
  }

  const getDbs = () => Object.keys(dbs);
  const getCurrent = () => current;
  const isReady = () => !!SQL;

  function setCurrent(name) {
    const k = findDb(name);
    if (!k) return false;
    current = k;
    openKeys.add('db:' + k);
    save();
    return true;
  }

  const getTables = (dbName) => listObjects(dbs[dbName] || db());
  const getColumns = (dbName, table) => columns(dbs[dbName] || db(), table);
  const getSample = () => SAMPLE;
  const getOpenKeys = () => openKeys;
  const saveNow = () => save();
  const setText = (t) => { try { localStorage.setItem(LS_TXT, t); } catch (e) { /* хранилище недоступно */ } };
  const getText = () => { try { return localStorage.getItem(LS_TXT) || ''; } catch (e) { return ''; } };

  function toggleKey(key) {
    if (openKeys.has(key)) openKeys.delete(key); else openKeys.add(key);
  }

  function resetAll() {
    for (const n in dbs) dbs[n].close();
    dbs = { master: newDb() };
    current = 'master';
    openKeys.clear();
    openKeys.add('db:master');
    save();
  }

  return {
    init, execute, isReady,
    getDbs, getCurrent, setCurrent,
    getTables, getColumns,
    getSample, getOpenKeys, toggleKey,
    resetAll, saveNow, setText, getText,
  };
}
