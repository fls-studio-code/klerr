/**
 * Каталог реальных моделей, которые тренажёр умеет скачать и запустить в браузере.
 *
 * В уроке используются Python-модели (gpt2, distilbert, facebook/bart-large-cnn).
 * Браузеру нужны их ONNX-версии, поэтому «питоновское» имя из кода студента
 * сопоставляется с ONNX-репозиторием на Hugging Face (Xenova/…).
 *
 * Размеры (sizeMB) — сумма файлов квантованной (q8) версии вместе с токенизатором,
 * по данным Hugging Face. Точный объём загрузки показывает индикатор прогресса.
 */

export const MODELS = [
  {
    hub: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    task: 'sentiment-analysis',
    title: 'DistilBERT · тональность',
    kind: 'энкодер (семейство BERT)',
    sizeMB: 69,
    names: [
      'distilbert/distilbert-base-uncased-finetuned-sst-2-english',
      'distilbert-base-uncased-finetuned-sst-2-english',
    ],
    note: 'Только английский. Классы: POSITIVE и NEGATIVE, нейтрального нет.',
  },
  {
    hub: 'Xenova/gpt2',
    task: 'text-generation',
    title: 'GPT‑2 · генерация текста',
    kind: 'только декодер (семейство GPT)',
    sizeMB: 130,
    // В репозитории Xenova/gpt2 квантованная версия лежит под старым именем файла
    // decoder_model_merged_quantized.onnx, а Transformers.js 4 для GPT-подобных ищет model_quantized.onnx.
    loadOptions: { model_file_name: 'decoder_model_merged' },
    names: ['gpt2', 'openai-community/gpt2'],
    note: 'Самая маленькая GPT‑2 (124M параметров). Пишет по-английски, часто повторяется.',
  },
  {
    hub: 'Xenova/distilbart-cnn-6-6',
    task: 'summarization',
    title: 'DistilBART · краткое изложение',
    kind: 'энкодер + декодер (семейство BART)',
    sizeMB: 285,
    names: ['sshleifer/distilbart-cnn-6-6', 'facebook/bart-large-cnn'],
    substitutes: ['facebook/bart-large-cnn'],
    note: 'Уменьшенная версия BART. Оригинал facebook/bart-large-cnn весит около 460 МБ, для браузера берётся эта.',
  },
  {
    hub: 'Xenova/opus-mt-en-ro',
    task: 'translation',
    title: 'OPUS‑MT · перевод en → ro',
    kind: 'энкодер + декодер (Marian)',
    sizeMB: 108,
    names: ['Helsinki-NLP/opus-mt-en-ro'],
    note: 'Перевод с английского на румынский.',
  },
]

/** Модель по умолчанию для задачи (как в Python, где pipeline сам подбирает модель). */
const DEFAULTS = {
  'sentiment-analysis': 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  'text-classification': 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  'text-generation': 'Xenova/gpt2',
  summarization: 'Xenova/distilbart-cnn-6-6',
  translation: 'Xenova/opus-mt-en-ro',
}

export const SUPPORTED_TASKS = Object.keys(DEFAULTS)

export function normalizeTask(task) {
  const t = String(task).trim().toLowerCase()
  if (/^translation(_[a-z]{2}_to_[a-z]{2})?$/.test(t)) return 'translation'
  return t
}

export function modelInfo(hub) {
  return MODELS.find(m => m.hub === hub) || null
}

/**
 * Какую модель из Hugging Face брать для пары (задача, имя из кода).
 * Возвращает { hub, info, substituted, guessed } или бросает Error с понятным текстом.
 */
export function resolveModel(task, name) {
  if (name == null) {
    const hub = DEFAULTS[task]
    if (!hub) {
      throw new Error(`Для задачи «${task}» в каталоге нет модели по умолчанию. Укажи модель: pipeline("${task}", model="Xenova/…"). Готовые задачи: ${SUPPORTED_TASKS.join(', ')}.`)
    }
    return { hub, info: modelInfo(hub), substituted: false, guessed: false, defaulted: true }
  }
  const lower = String(name).toLowerCase()
  const known = MODELS.find(m => m.hub.toLowerCase() === lower || m.names.some(n => n.toLowerCase() === lower))
  if (known) {
    return {
      hub: known.hub,
      info: known,
      substituted: (known.substitutes || []).some(s => s.toLowerCase() === lower),
      guessed: false,
      defaulted: false,
    }
  }
  if (lower.startsWith('xenova/') || lower.startsWith('onnx-community/')) {
    return { hub: String(name), info: null, substituted: false, guessed: false, defaulted: false }
  }
  // Неизвестная питоновская модель: пробуем её ONNX-версию Xenova/<имя>
  const short = String(name).split('/').pop()
  return { hub: `Xenova/${short}`, info: null, substituted: false, guessed: true, defaulted: false }
}

/** Токенизаторы: имя из кода → репозиторий с файлами токенизатора. */
export function resolveTokenizer(name) {
  const lower = String(name).toLowerCase()
  if (lower === 'gpt2' || lower === 'openai-community/gpt2') return 'Xenova/gpt2'
  const known = MODELS.find(m => m.hub.toLowerCase() === lower || m.names.some(n => n.toLowerCase() === lower))
  if (known) return known.hub
  if (lower.startsWith('xenova/')) return String(name)
  return `Xenova/${String(name).split('/').pop()}`
}
