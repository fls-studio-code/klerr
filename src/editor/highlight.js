/**
 * Подсветка T-SQL для редактора. Лёгкий токенизатор без зависимостей:
 * комментарии, строки, [имена], числа, ключевые слова, функции, типы, GO.
 */

const KEYWORDS = new Set(`ADD ALL ALTER AND ANY AS ASC AUTHORIZATION BEGIN BETWEEN BY CASCADE CASE CHECK CLUSTERED COLUMN
COMMIT CONSTRAINT CREATE CROSS DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END ESCAPE EXCEPT EXEC EXECUTE EXISTS
FETCH FOR FOREIGN FROM FULL GROUP HAVING IDENTITY IDENTITY_INSERT IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY
LEFT LIKE NEXT NOCHECK NOCOUNT NONCLUSTERED NOT NULL OFF OFFSET ON ONLY OR ORDER OUTER PERCENT PRIMARY PRINT
REFERENCES RIGHT ROWS ROW SCHEMA SELECT SET TABLE THEN TIES TOP TRUNCATE UNION UNIQUE UPDATE USE VALUES VIEW WHEN
WHERE WITH`.split(/\s+/))

const TYPES = new Set(`BIGINT BINARY BIT CHAR DATE DATETIME DATETIME2 DATETIMEOFFSET DEC DECIMAL FLOAT IMAGE INT INTEGER
MONEY NCHAR NTEXT NUMERIC NVARCHAR REAL SMALLDATETIME SMALLINT SMALLMONEY SQL_VARIANT TEXT TIME TIMESTAMP TINYINT
UNIQUEIDENTIFIER VARBINARY VARCHAR XML MAX`.split(/\s+/))

const FUNCS = new Set(`ABS AVG CAST CEILING CHARINDEX COALESCE CONCAT CONCAT_WS CONVERT COUNT DATEADD DATEDIFF DATENAME
DATEPART DATEFROMPARTS DAY DB_ID DB_NAME EOMONTH FLOOR FORMAT GETDATE GETUTCDATE IIF ISDATE ISNULL ISNUMERIC LEN LOWER
LTRIM MAX MIN MONTH NEWID NULLIF OBJECT_ID PATINDEX POWER REPLACE REPLICATE REVERSE ROUND RTRIM SCHEMA_ID
SCOPE_IDENTITY SIGN SPACE SQRT SQUARE STR STUFF SUBSTRING SUM SYSDATETIME TRIM TRY_CAST TRY_CONVERT UPPER YEAR`.split(/\s+/))

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TOKEN = /(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|(N?'(?:[^']|'')*(?:'|$))|(\[[^\]\n]*\]?)|(@@?\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$#]*)/g

export function highlight(text) {
  let out = '', last = 0, m
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out += esc(text.slice(last, m.index))
    const t = m[0]
    let cls = null
    if (m[1] || m[2]) cls = 'hl-c'
    else if (m[3]) cls = 'hl-s'
    else if (m[4]) cls = 'hl-i'
    else if (m[5]) cls = 'hl-v'
    else if (m[6]) cls = 'hl-n'
    else if (m[7]) {
      const u = t.toUpperCase()
      const next = text.slice(TOKEN.lastIndex).match(/^\s*\(/)
      if (u === 'GO' && /(^|\n)[ \t]*$/.test(text.slice(0, m.index))) cls = 'hl-g'
      else if (TYPES.has(u)) cls = 'hl-t'
      else if (FUNCS.has(u) && next) cls = 'hl-f'
      else if (KEYWORDS.has(u)) cls = 'hl-k'
      else if (FUNCS.has(u)) cls = 'hl-f'
    }
    out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t)
    last = TOKEN.lastIndex
    if (t === '') TOKEN.lastIndex++
  }
  out += esc(text.slice(last))
  // у <pre> последняя пустая строка схлопывается — добавляем пробел
  return out + (text.endsWith('\n') || !text ? ' ' : '')
}
