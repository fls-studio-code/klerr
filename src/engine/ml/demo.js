/**
 * Демо-модели: работают сразу, без скачивания и без интернета.
 *
 * Это НЕ нейросети, а маленькие игрушечные аналоги, которые показывают ту же
 * форму ответа, что и настоящие pipeline:
 *   sentiment-analysis → словарь оценок слов (с отрицанием «not good»)
 *   text-generation    → цепь Маркова по небольшому тексту
 *   summarization      → выбор самых «весомых» предложений
 *   AutoTokenizer      → приближённое деление на токены в стиле GPT‑2
 * Реальные модели (DistilBERT, GPT‑2, DistilBART) включаются в режиме «Реальные модели».
 */
import { PyError } from '../pylite/errors.js'
import { createRng } from '../pylite/builtins.js'

/* ---------- токены ---------- */
const WORD = /[A-Za-z']+|[.,!?;:]/g
const PUNCT = /^[.,!?;:]$/

function wordTokens(text) {
  return text.match(WORD) || []
}

/* ---------- тональность ---------- */
const POS = new Set(`good great excellent amazing wonderful fantastic awesome love loved lovely like liked enjoy enjoyed best nice
friendly delicious tasty fresh perfect happy pleased beautiful cozy clean fast helpful polite superb brilliant outstanding
recommend recommended favorite fun cool wow impressive smooth comfortable genuine charming`.split(/\s+/))

const NEG = new Set(`bad terrible awful horrible worst hate hated dislike slow rude dirty cold disgusting disappointing
disappointed poor boring expensive broken late noisy unhappy sad angry useless annoying mediocre bland stale overpriced bug
bugs failed fail problem problems delay delayed waste ugly smelly crowded unfriendly`.split(/\s+/))

const NEGATORS = new Set(['not', 'no', 'never', 'without', 'hardly', 'nothing', 'cannot'])
const INTENS = new Set(['very', 'really', 'extremely', 'absolutely', 'totally', 'so', 'too', 'quite', 'incredibly'])

function sentimentOf(text) {
  const toks = (text.toLowerCase().match(/[a-z']+|!/g) || [])
  let score = 0
  let hits = 0
  let excl = 0
  let negLeft = 0
  toks.forEach((w, i) => {
    if (w === '!') { excl++; return }
    const isNegator = NEGATORS.has(w) || w.endsWith("n't")
    if (isNegator) { negLeft = 3; return }
    let v = POS.has(w) ? 1 : NEG.has(w) ? -1 : 0
    if (v !== 0) {
      hits++
      if (INTENS.has(toks[i - 1])) v *= 1.5
      if (negLeft > 0) v *= -0.8
      score += v
    }
    if (negLeft > 0) negLeft--
  })
  score *= 1 + 0.1 * Math.min(excl, 3)
  const label = score >= 0 ? 'POSITIVE' : 'NEGATIVE'
  const conf = hits === 0 ? 0.5 : 0.5 + 0.49 * Math.tanh(Math.abs(score) / 1.2)
  return { label, score: Math.round(conf * 10000) / 10000 }
}

/* ---------- генерация (цепь Маркова) ---------- */
const CORPUS = `Once upon a time there was a little robot who lived in a small town by the sea. Every morning the robot woke up early and walked to the harbor to watch the boats. The robot loved to learn new things, and every day it asked the old fisherman a new question. The fisherman smiled and told stories about the waves, the wind and the stars.
One day a storm came to the town. The sky turned dark and the wind began to blow. The little robot was not afraid. It helped the people carry their boats to a safe place and it shared its light with everyone. After the storm the town was quiet and the people thanked the robot for its help.
Artificial intelligence is the science of teaching computers to learn from data. A model reads many examples and finds patterns in them. Then the model can predict the next word, recognize a picture or translate a sentence. The more good data a model sees, the better it learns. Learning is a process of practice, and practice makes every student stronger.
Transformers are a type of neural network that reads the whole sentence at once. The model pays attention to the important words and ignores the rest. This idea helped computers to write text, answer questions and summarize long articles. A good project starts with a clear idea, a simple plan and a small prototype that students can test with friends.
Once upon a time a young programmer wrote a small program for her school. The program helped students to find books and to share ideas. She tested the program every week, fixed the mistakes and added new features. Soon the whole school used it, and the programmer was proud of her work.`

const chain2 = new Map()
const chain1 = new Map()
const starts = []

;(function buildChains() {
  const toks = wordTokens(CORPUS)
  const add = (map, key, next) => {
    let m = map.get(key)
    if (!m) { m = new Map(); map.set(key, m) }
    m.set(next, (m.get(next) || 0) + 1)
  }
  toks.forEach((t, i) => {
    if (i === 0 || /^[.!?]$/.test(toks[i - 1])) starts.push(t)
    if (i + 1 < toks.length) add(chain1, t.toLowerCase(), toks[i + 1])
    if (i + 2 < toks.length) add(chain2, t.toLowerCase() + ' ' + toks[i + 1].toLowerCase(), toks[i + 2])
  })
})()

function pickNext(cands, rng, doSample, temperature, topK) {
  let entries = [...cands].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (!doSample) return entries[0][0]
  if (topK > 0) entries = entries.slice(0, topK)
  const weights = entries.map(([, c]) => c ** (1 / Math.max(temperature, 0.05)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * total
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i]
    if (r <= 0) return entries[i][0]
  }
  return entries[entries.length - 1][0]
}

function generate(prompt, kw, rng) {
  const ptoks = wordTokens(prompt)
  const hasNew = kw.max_new_tokens != null
  let budget = hasNew ? kw.max_new_tokens : kw.max_length != null ? kw.max_length - ptoks.length : 40
  if (!Number.isFinite(budget) || budget < 1) budget = 1
  budget = Math.min(budget, 300)
  const doSample = kw.do_sample === undefined ? true : !!kw.do_sample
  const temperature = typeof kw.temperature === 'number' ? kw.temperature : 1
  const topK = typeof kw.top_k === 'number' ? kw.top_k : 50
  const out = [...ptoks]
  let text = prompt
  for (let k = 0; k < budget; k++) {
    const l1 = out.length ? out[out.length - 1].toLowerCase() : ''
    const l2 = out.length > 1 ? out[out.length - 2].toLowerCase() + ' ' + l1 : ''
    const cands = chain2.get(l2) || chain1.get(l1)
    const next = cands ? pickNext(cands, rng, doSample, temperature, topK) : starts[Math.floor(rng.next() * starts.length)]
    out.push(next)
    text += (PUNCT.test(next) || text === '' ? '' : ' ') + next
  }
  return text
}

/* ---------- краткое изложение ---------- */
const STOP = new Set(`a an the of to in on at for from by with and or but is are was were be been it its this that these those as
he she they we you i his her their our your not no so than then there which who whom what when where while also can could will
would should may might has have had do does did into about over after before more most very such`.split(/\s+/))

function splitSentences(text) {
  const s = text.replace(/\s+/g, ' ').trim()
  return (s.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || []).map(x => x.trim()).filter(Boolean)
}

function summarize(text, kw) {
  const maxLen = kw.max_length ?? 130
  const minLen = kw.min_length ?? 30
  const sents = splitSentences(text)
  if (!sents.length) return ''
  const sentWords = sents.map(s => (s.toLowerCase().match(/[a-z']+/g) || []).filter(w => !STOP.has(w)))
  const freq = new Map()
  sentWords.forEach(ws => ws.forEach(w => freq.set(w, (freq.get(w) || 0) + 1)))
  const maxF = Math.max(1, ...freq.values())
  const scores = sentWords.map((ws, i) => {
    const sum = ws.reduce((a, w) => a + freq.get(w) / maxF, 0)
    return sum / Math.pow(Math.max(ws.length, 1), 0.6) + (i === 0 ? 0.4 : 0)
  })
  const sizes = sents.map(s => wordTokens(s).length)
  const order = sents.map((_, i) => i).sort((a, b) => scores[b] - scores[a])
  const chosen = new Set()
  let used = 0
  for (const i of order) {
    if (used + sizes[i] <= maxLen) { chosen.add(i); used += sizes[i] }
    if (used >= minLen && chosen.size >= 1 && used >= maxLen * 0.6) break
  }
  if (!chosen.size) {
    // первое предложение не влезает: берём лучшее и обрезаем по словам
    const best = order[0]
    return sents[best].split(' ').slice(0, Math.max(1, Math.floor(maxLen * 0.75))).join(' ').replace(/[,;:]$/, '') + '…'
  }
  return [...chosen].sort((a, b) => a - b).map(i => sents[i]).join(' ')
}

/* ---------- токенизация в стиле GPT‑2 ---------- */
const PRE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu
const SUFFIXES = ['ations', 'ation', 'ments', 'ment', 'ings', 'ing', 'ness', 'ions', 'ion', 'ally', 'ers', 'ly', 'ed', 'es', 's']

function toTokens(text) {
  const out = []
  for (const piece of text.match(PRE) || []) {
    const lead = piece.startsWith(' ')
    const body = lead ? piece.slice(1) : piece
    let parts = [body]
    if (/^\p{L}+$/u.test(body) && body.length > 8) {
      const suf = SUFFIXES.find(s => body.endsWith(s) && body.length - s.length >= 4)
      parts = suf ? [body.slice(0, -suf.length), suf] : body.match(/.{1,6}/gu)
    }
    parts.forEach((p, i) => out.push((i === 0 && lead ? 'Ġ' : '') + p.replace(/\n/g, 'Ċ')))
  }
  return out
}

/* ---------- публичный интерфейс ---------- */
function asTextList(input, task) {
  const list = Array.isArray(input) ? input : [input]
  list.forEach((x) => {
    if (typeof x !== 'string') {
      throw new PyError('TypeError', `${task}: ожидается строка или список строк, получено ${x === null ? 'None' : typeof x}`, null,
        'Передай текст в кавычках: pipe("I love it") или список таких строк.')
    }
  })
  return { list, single: !Array.isArray(input) }
}

export function createDemo() {
  const rng = createRng()
  const supported = ['sentiment-analysis', 'text-classification', 'text-generation', 'summarization']

  return {
    reseed() { rng.seed(Math.floor(Math.random() * 2 ** 32)) },
    setSeed(n) { rng.seed(n) },

    async pipeline(task, model, opts, io = {}) {
      if (task === 'translation' || task.startsWith('translation')) {
        throw new PyError('RuntimeError', 'перевод доступен только в режиме «Реальные модели»', null,
          'Включи переключатель «Реальные модели» вверху и скачай модель OPUS‑MT (около 108 МБ).')
      }
      if (!supported.includes(task)) {
        throw new PyError('ValueError', `Unknown task ${task}`, null,
          `В демо-режиме доступны задачи: sentiment-analysis, text-generation, summarization. Остальное (translation) работает в режиме «Реальные модели».`)
      }
      if (model == null && io.info) {
        const name = { 'sentiment-analysis': 'distilbert-base-uncased-finetuned-sst-2-english', 'text-classification': 'distilbert-base-uncased-finetuned-sst-2-english', 'text-generation': 'gpt2', summarization: 'sshleifer/distilbart-cnn-12-6' }[task]
        io.info(`No model was supplied, defaulted to ${name} (в демо-режиме работает игрушечный аналог)`)
      }

      if (task === 'text-generation') {
        return async (input, kw) => {
          const { list, single } = asTextList(input, 'text-generation')
          const n = Math.max(1, Math.min(Number(kw.num_return_sequences) || 1, 5))
          const res = list.map(p => Array.from({ length: n }, () => ({ generated_text: generate(p, kw, rng) })))
          return single ? res[0] : res
        }
      }
      if (task === 'summarization') {
        return async (input, kw) => {
          const { list } = asTextList(input, 'summarization')
          const res = list.map(t => ({ summary_text: summarize(t, kw) }))
          return res
        }
      }
      return async (input) => {
        const { list } = asTextList(input, 'sentiment-analysis')
        return list.map(sentimentOf)
      }
    },

    async tokenizer(name) {
      return {
        name,
        tokenize: async text => toTokens(text),
        encode: async () => {
          throw new PyError('RuntimeError', 'encode() доступен только в режиме «Реальные модели»', null,
            'Номера токенов берутся из настоящего словаря модели. Включи «Реальные модели» (токенизатор GPT‑2 весит около 2 МБ).')
        },
      }
    },
  }
}
