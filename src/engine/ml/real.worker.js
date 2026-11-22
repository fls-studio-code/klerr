/**
 * Web Worker для настоящих моделей. Здесь живёт Transformers.js:
 * загрузка, кэш в браузере и вычисления идут вне основного потока,
 * поэтому страница не зависает, пока модель думает.
 */
import { pipeline, AutoTokenizer } from '@huggingface/transformers'

const pipes = new Map()
const tokenizers = new Map()

function getPipe(task, hub, onProgress, loadOptions = {}) {
  const key = `${task}|${hub}`
  if (!pipes.has(key)) {
    pipes.set(
      key,
      pipeline(task, hub, { dtype: 'q8', ...loadOptions, progress_callback: onProgress }).catch((e) => {
        pipes.delete(key)
        throw e
      }),
    )
  }
  return pipes.get(key)
}

function getTokenizer(hub, onProgress) {
  if (!tokenizers.has(hub)) {
    tokenizers.set(
      hub,
      AutoTokenizer.from_pretrained(hub, { progress_callback: onProgress }).catch((e) => {
        tokenizers.delete(hub)
        throw e
      }),
    )
  }
  return tokenizers.get(hub)
}

/** Результат модели → простые данные, которые можно передать между потоками. */
function plain(v) {
  return JSON.parse(JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x)))
}

self.onmessage = async (ev) => {
  const { id, op } = ev.data
  const post = m => self.postMessage({ id, ...m })
  const onProgress = data => post({ type: 'progress', data })
  try {
    if (op === 'load') {
      await getPipe(ev.data.task, ev.data.hub, onProgress, ev.data.loadOptions)
      post({ type: 'result', value: true })
    } else if (op === 'run') {
      const pipe = await getPipe(ev.data.task, ev.data.hub, onProgress, ev.data.loadOptions)
      const out = await pipe(ev.data.input, ev.data.options || {})
      post({ type: 'result', value: plain(out) })
    } else if (op === 'tokenize') {
      const tok = await getTokenizer(ev.data.hub, onProgress)
      post({ type: 'result', value: plain(tok.tokenize(ev.data.text)) })
    } else if (op === 'encode') {
      const tok = await getTokenizer(ev.data.hub, onProgress)
      post({ type: 'result', value: plain(tok.encode(ev.data.text)) })
    } else {
      post({ type: 'error', message: `unknown op ${op}` })
    }
  } catch (e) {
    post({ type: 'error', message: e && e.message ? e.message : String(e) })
  }
}
