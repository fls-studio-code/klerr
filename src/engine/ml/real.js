/**
 * Мост между страницей и Web Worker с Transformers.js.
 * Подгружается лениво (динамический import), поэтому лендинг и SQL-тренажёр
 * не тянут ни воркер, ни библиотеку.
 *
 * Сеть: файлы моделей берутся с huggingface.co, wasm-движок ONNX Runtime
 * с cdn.jsdelivr.net. После первой загрузки модель лежит в кэше браузера
 * (Cache Storage, ключ transformers-cache) и работает без повторного скачивания.
 */

const CACHE_KEY = 'transformers-cache'

let worker = null
let nextId = 1
const pending = new Map()

function rejectAll(err) {
  for (const p of pending.values()) p.reject(err)
  pending.clear()
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./real.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (ev) => {
    const m = ev.data
    const p = pending.get(m.id)
    if (!p) return
    if (m.type === 'progress') {
      if (p.onProgress) p.onProgress(m.data)
      return
    }
    pending.delete(m.id)
    if (m.type === 'error') p.reject(new Error(m.message))
    else p.resolve(m.value)
  }
  worker.onerror = (e) => {
    rejectAll(new Error(e.message || 'Не удалось запустить фоновый процесс для модели'))
    worker = null
  }
  return worker
}

function request(msg, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject, onProgress })
    getWorker().postMessage({ id, ...msg })
  })
}

/** Остановить вычисления: воркер уничтожается, скачанное в кэше остаётся. */
export function terminate() {
  if (worker) { worker.terminate(); worker = null }
  rejectAll(new Error('Выполнение остановлено'))
}

export const loadPipeline = (task, hub, onProgress, loadOptions = {}) => request({ op: 'load', task, hub, loadOptions }, onProgress)
export const runPipeline = (task, hub, input, options, onProgress, loadOptions = {}) => request({ op: 'run', task, hub, input, options, loadOptions }, onProgress)
export const tokenize = (hub, text, onProgress) => request({ op: 'tokenize', hub, text }, onProgress)
export const encode = (hub, text, onProgress) => request({ op: 'encode', hub, text }, onProgress)

/* ---------- что уже скачано ---------- */
const HUB_URL = /huggingface\.co\/(.+?)\/resolve\//

export async function cachedHubs() {
  const found = new Set()
  if (typeof caches === 'undefined') return found
  try {
    const cache = await caches.open(CACHE_KEY)
    for (const req of await cache.keys()) {
      const m = HUB_URL.exec(req.url)
      if (m && /\.onnx(\?|$)/.test(req.url)) found.add(decodeURIComponent(m[1]))
    }
  } catch (e) { /* хранилище недоступно */ }
  return found
}

export async function clearHub(hub) {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE_KEY)
    for (const req of await cache.keys()) {
      const m = HUB_URL.exec(req.url)
      if (m && decodeURIComponent(m[1]) === hub) await cache.delete(req)
    }
  } catch (e) { /* ничего страшного */ }
}

/* ---------- человеческие сообщения об ошибках ---------- */
export function friendlyError(e) {
  const msg = e && e.message ? e.message : String(e)
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
    return 'Не удалось скачать файлы модели. Проверь интернет (нужны huggingface.co и cdn.jsdelivr.net) и запусти ещё раз.'
  }
  if (/Could not locate file|404|Unauthorized|401|not found/i.test(msg)) {
    return 'Для этой модели нет версии для браузера (ONNX). Возьми модель из панели «Модели» или с приставкой Xenova/.'
  }
  if (/memory|allocation|out of/i.test(msg)) {
    return 'Не хватило памяти устройства для этой модели. Попробуй модель поменьше или другое устройство.'
  }
  return msg
}
