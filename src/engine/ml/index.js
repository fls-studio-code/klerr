/**
 * Единая точка доступа к моделям для интерпретатора.
 * Режим «demo» — игрушечные модели (сразу, офлайн).
 * Режим «real» — настоящие модели через Transformers.js (скачиваются один раз).
 *
 * host — то, что страница даёт движку:
 *   getMode()                      → 'demo' | 'real'
 *   info(text)                     → служебная строка в выводе (как предупреждения Python)
 *   confirmDownload(hub, info)     → Promise<boolean>: спросить про скачивание
 *   onProgress(hub, event)         → ход загрузки файлов модели
 *   onModelReady(hub)              → модель загружена, обновить список «в кэше»
 */
import { PyError } from '../pylite/errors.js'
import { createDemo } from './demo.js'
import { MODELS, normalizeTask, resolveModel, resolveTokenizer } from './catalog.js'

const GEN_OPTS = ['max_new_tokens', 'max_length', 'min_length', 'do_sample', 'temperature', 'top_k', 'top_p', 'repetition_penalty', 'num_beams', 'num_return_sequences']
const OPTIONS = {
  'text-generation': new Set(GEN_OPTS),
  summarization: new Set(GEN_OPTS),
  translation: new Set(GEN_OPTS),
  'sentiment-analysis': new Set(['top_k']),
  'text-classification': new Set(['top_k']),
}
// Параметры Python, которые безвредны и не заслуживают предупреждения
const SILENT = new Set(['truncation', 'padding', 'pad_token_id', 'return_full_text', 'clean_up_tokenization_spaces', 'device', 'framework'])

export function createML(host) {
  const demo = createDemo()
  let real = null
  const loadReal = async () => {
    if (!real) real = await import('./real.js')
    return real
  }
  const info = text => host.info && host.info(text)

  const wrap = async (fn) => {
    try { return await fn() } catch (e) {
      if (e instanceof PyError) throw e
      const mod = real
      throw new PyError('RuntimeError', mod ? mod.friendlyError(e) : (e && e.message) || String(e), null,
        'Если не получается скачать модель, переключись в «Демо»: он работает без интернета.')
    }
  }

  async function ensureDownloaded(mod, hub, details) {
    const cached = await mod.cachedHubs()
    if (cached.has(hub)) return
    const ok = await host.confirmDownload(hub, details)
    if (!ok) {
      throw new PyError('RuntimeError', 'Загрузка модели отменена', null,
        'Выбери режим «Демо», если не хочешь скачивать модель: он работает сразу.')
    }
  }

  async function realPipeline(task, model) {
    const mod = await loadReal()
    let r
    try { r = resolveModel(task, model) } catch (e) { throw new PyError('ValueError', e.message) }
    if (r.defaulted) info(`No model was supplied, defaulted to ${r.hub}`)
    else if (r.substituted) info(`В браузере вместо ${model} используется уменьшенная модель ${r.hub}`)
    else if (r.guessed) info(`Для «${model}» ищу версию для браузера: ${r.hub}`)
    await ensureDownloaded(mod, r.hub, r.info)
    const loadOptions = (r.info && r.info.loadOptions) || {}
    await wrap(() => mod.loadPipeline(task, r.hub, p => host.onProgress(r.hub, p), loadOptions))
    if (host.onModelReady) await host.onModelReady(r.hub)

    const allowed = OPTIONS[task] || new Set()
    return async (input, kw) => {
      const options = {}
      const ignored = []
      for (const [k, v] of Object.entries(kw || {})) {
        if (allowed.has(k) && v !== null && v !== undefined) options[k] = v
        else if (!SILENT.has(k)) ignored.push(k)
      }
      if (task === 'text-generation') {
        if (options.do_sample === undefined) options.do_sample = true
        if (options.max_new_tokens === undefined && options.max_length === undefined) options.max_new_tokens = 40
      }
      if (ignored.length) info(`Параметры ${ignored.join(', ')} в режиме реальных моделей не используются`)
      return wrap(() => mod.runPipeline(task, r.hub, input, options, undefined, loadOptions))
    }
  }

  return {
    get mode() { return host.getMode() },

    beginRun() { demo.reseed() },
    setSeed(n) { demo.setSeed(n) },

    async pipeline(task, model, kw) {
      const t = normalizeTask(task)
      if (host.getMode() === 'real') return realPipeline(t, model)
      return demo.pipeline(t, model, kw, { info })
    },

    async tokenizer(name) {
      if (host.getMode() !== 'real') return demo.tokenizer(name)
      const mod = await loadReal()
      const hub = resolveTokenizer(name)
      await ensureDownloaded(mod, hub, { hub, title: `Токенизатор ${hub}`, sizeMB: 2 })
      await wrap(() => mod.tokenize(hub, 'warm up', p => host.onProgress(hub, p)))
      return {
        name,
        tokenize: text => wrap(() => mod.tokenize(hub, text)),
        encode: text => wrap(() => mod.encode(hub, text)),
      }
    },

    /** Кнопка Stop: останавливает воркер (скачанное остаётся в кэше). */
    stop() { if (real) real.terminate() },

    /** Для панели «Модели» */
    async cachedHubs() { return (await loadReal()).cachedHubs() },
    async clearHub(hub) { return (await loadReal()).clearHub(hub) },
    async preload(hub, task, onProgress) {
      const mod = await loadReal()
      const info = MODELS.find(m => m.hub === hub)
      await wrap(() => mod.loadPipeline(task, hub, p => onProgress(hub, p), (info && info.loadOptions) || {}))
    },
  }
}
