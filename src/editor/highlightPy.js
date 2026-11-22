/**
 * Подсветка мини-Python для редактора лаборатории.
 * Формат результата такой же, как у highlight.js для SQL: каждая строка
 * лежит в своём блоке .hl-ln, а строка с ошибкой получает класс err.
 */

const KEYWORDS = new Set(`and as break continue def elif else except for from if import in is lambda not or pass raise return try while
True False None`.split(/\s+/))

const BUILTINS = new Set(`print len range str int float bool list dict tuple sorted reversed enumerate zip map filter sum min max abs round
isinstance type any all repr format input open`.split(/\s+/))

const API = new Set('pipeline set_seed AutoTokenizer'.split(/\s+/))

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TOKEN = /(#[^\n]*)|([rRfF]{0,2}(?:'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:\\.|[^'\\\n])*(?:'|$)|"(?:\\.|[^"\\\n])*(?:"|$)))|(\b\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?\b)|([\p{L}_][\p{L}\p{N}_]*)/gu

export function highlightPy(text, errorLine = null) {
  let out = ''
  let last = 0
  let m
  const wrap = (cls, t) => t.split('\n').map(x => (x ? `<span class="${cls}">${esc(x)}</span>` : '')).join('\n')
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out += esc(text.slice(last, m.index))
    const t = m[0]
    let cls = null
    if (m[1]) cls = 'hl-c'
    else if (m[2]) cls = 'hl-s'
    else if (m[3]) cls = 'hl-n'
    else if (m[4]) {
      const after = text.slice(TOKEN.lastIndex)
      const isCall = /^\s*\(/.test(after)
      const afterDef = /(^|\n)[ \t]*def[ \t]+$/.test(text.slice(0, m.index))
      if (KEYWORDS.has(t)) cls = t === 'True' || t === 'False' || t === 'None' ? 'hl-t' : 'hl-k'
      else if (afterDef || API.has(t) || BUILTINS.has(t) || isCall) cls = 'hl-f'
    }
    out += cls ? wrap(cls, t) : esc(t)
    last = TOKEN.lastIndex
    if (t === '') TOKEN.lastIndex++
  }
  out += esc(text.slice(last))
  return out.split('\n')
    .map((line, i) => `<div class="hl-ln${i === errorLine ? ' err' : ''}">${line || ' '}</div>`)
    .join('')
}
