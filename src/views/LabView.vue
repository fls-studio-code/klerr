<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { runProgram } from '../engine/pylite/interp.js'
import { createML } from '../engine/ml/index.js'
import { MODELS } from '../engine/ml/catalog.js'
import { LAB_LESSONS, LAB_ALL, LAB_WELCOME, LAB_SNIPPETS, findLabExample } from '../lab/examples.js'
import { highlightPy } from '../editor/highlightPy.js'
import { useSplit } from '../composables/useSplit.js'
import '../styles/trainer.css'
import '../styles/lab.css'
import KlerrMark from '../components/KlerrMark.vue'
import LessonMenu from '../components/LessonMenu.vue'
import SnippetBar from '../components/SnippetBar.vue'
import SqlEditor from '../components/SqlEditor.vue'
import ModelPanel from '../components/ModelPanel.vue'
import LabHelp from '../components/LabHelp.vue'

const LS_CODE = 'klerr_lab_code'
const LS_MODE = 'klerr_lab_mode'

const lsGet = (k) => { try { return localStorage.getItem(k) } catch (e) { return null } }
const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { /* хранилище недоступно */ } }

const code = ref(lsGet(LS_CODE) ?? LAB_WELCOME)
const mode = ref(lsGet(LS_MODE) === 'real' ? 'real' : 'demo')
const messages = ref([])
const running = ref(false)
const errorLine = ref(null)
const hadError = ref(false)
const activeTab = ref('output')
const status = ref('Готово · режим: ' + (mode.value === 'real' ? 'реальные модели' : 'демо'))
const sideOpen = ref(false)
const editor = ref(null)
const mainEl = ref(null)
const outEl = ref(null)

const { split, dragging, start: startSplit, move: moveSplit, end: endSplit, key: keySplit, reset: resetSplit } = useSplit('klerr_lab_split', mainEl)

/* ---------- модели: что скачано и как идёт загрузка ---------- */
const cached = ref(new Set())
const loads = ref({})
const preloading = ref(false)
const accepted = new Set() // модели, на скачивание которых студент уже согласился

function mb(bytes) { return (bytes / 1e6).toFixed(0) }

function setLoad(hub, patch) {
  loads.value = { ...loads.value, [hub]: { files: {}, state: 'loading', pct: 0, loaded: 0, total: 0, ...(loads.value[hub] || {}), ...patch } }
}

function onProgress(hub, ev) {
  const cur = loads.value[hub] || { files: {} }
  const files = { ...cur.files }
  if (ev.status === 'progress' && ev.file) files[ev.file] = { loaded: ev.loaded || 0, total: ev.total || 0 }
  else if (ev.status === 'done' && ev.file && files[ev.file]) files[ev.file] = { loaded: files[ev.file].total, total: files[ev.file].total }
  const list = Object.values(files)
  const loaded = list.reduce((a, f) => a + f.loaded, 0)
  const total = list.reduce((a, f) => a + f.total, 0)
  const state = ev.status === 'ready' ? 'done' : 'loading'
  setLoad(hub, { files, loaded, total, pct: total ? Math.min(100, (loaded / total) * 100) : 0, state })
  if (state === 'loading' && total) {
    status.value = `Скачиваю ${hub}: ${Math.round((loaded / total) * 100)}% · ${mb(loaded)} из ${mb(total)} МБ`
  }
}

async function refreshCached() {
  try { cached.value = await ml.cachedHubs() } catch (e) { /* без кэша панель просто покажет «не скачано» */ }
}

function askDownload(hub, info) {
  if (accepted.has(hub)) return Promise.resolve(true)
  const size = info ? `≈ ${info.sizeMB} МБ` : 'размер заранее неизвестен'
  const ok = window.confirm(`Скачать модель ${hub} (${size})?\n\nОна сохранится в браузере, повторно скачивать не придётся. Лучше делать это по Wi‑Fi.`)
  if (ok) accepted.add(hub)
  return Promise.resolve(ok)
}

const ml = createML({
  getMode: () => mode.value,
  info: text => addMessage('dim', text + '\n'),
  confirmDownload: askDownload,
  onProgress,
  onModelReady: async (hub) => {
    setLoad(hub, { state: 'done', pct: 100 })
    await refreshCached()
  },
})

async function downloadModel(m) {
  if (preloading.value || running.value) return
  const ok = await askDownload(m.hub, m)
  if (!ok) return
  preloading.value = true
  setLoad(m.hub, { files: {}, loaded: 0, total: 0, pct: 0, state: 'loading' })
  status.value = `Скачиваю ${m.title}…`
  try {
    await ml.preload(m.hub, m.task, onProgress)
    setLoad(m.hub, { state: 'done', pct: 100 })
    status.value = `Модель ${m.title} скачана · можно переключиться на «Реальные модели»`
  } catch (e) {
    setLoad(m.hub, { state: 'error' })
    status.value = 'Не удалось скачать: ' + (e && e.message ? e.message : e)
  } finally {
    preloading.value = false
    await refreshCached()
  }
}

async function removeModel(hub) {
  if (!window.confirm(`Удалить модель ${hub} из кэша браузера? При следующем использовании её придётся скачать заново.`)) return
  await ml.clearHub(hub)
  accepted.delete(hub)
  const next = { ...loads.value }
  delete next[hub]
  loads.value = next
  await refreshCached()
  status.value = `Модель ${hub} удалена из кэша`
}

function setMode(next) {
  mode.value = next
  lsSet(LS_MODE, next)
  status.value = 'Режим: ' + (next === 'real' ? 'реальные модели (скачиваются один раз)' : 'демо (игрушечные модели, работают сразу)')
  if (next === 'real') refreshCached()
}

/* ---------- вывод программы ---------- */
let scrollQueued = false
function scrollDown() {
  if (scrollQueued) return
  scrollQueued = true
  requestAnimationFrame(() => {
    scrollQueued = false
    const el = outEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function addMessage(t, m, extra = {}) {
  const last = messages.value[messages.value.length - 1]
  if (t === 'out' && last && last.t === 'out') last.m += m
  else messages.value.push({ t, m, ...extra })
  scrollDown()
}

const cancel = { value: false }

async function run() {
  if (running.value) return
  messages.value = []
  errorLine.value = null
  hadError.value = false
  activeTab.value = 'output'
  cancel.value = false
  running.value = true
  status.value = mode.value === 'real' ? 'Выполняется… (реальные модели)' : 'Выполняется…'
  ml.beginRun()

  const res = await runProgram(code.value, { write: t => addMessage('out', t), ml, cancel })
  running.value = false

  const secs = (res.ms / 1000).toFixed(2)
  if (cancel.value) {
    addMessage('dim', 'Выполнение остановлено.\n')
    status.value = `Остановлено · ${secs} с`
  } else if (res.error) {
    const e = res.error
    hadError.value = true
    errorLine.value = e.line ? e.line - 1 : null
    const where = e.line ? `\n  File "main.py", line ${e.line}` : ''
    addMessage('err', `Traceback (most recent call last):${where}\n${e.type}: ${e.message}`, { line: e.line ? e.line - 1 : undefined })
    if (e.hint) addMessage('hint', e.hint)
    status.value = e.line ? `Ошибка в строке ${e.line} · ${secs} с` : `Ошибка · ${secs} с`
  } else {
    status.value = `Готово · ${secs} с · режим: ${mode.value === 'real' ? 'реальные модели' : 'демо'}`
  }
  if (mode.value === 'real') refreshCached()
}

function stop() {
  if (!running.value) return
  cancel.value = true
  ml.stop()
}

/* ---------- редактор ---------- */
function setCode(value) {
  code.value = value
  lsSet(LS_CODE, value)
  errorLine.value = null
}

function loadExample(id) {
  const ex = findLabExample(id)
  if (!ex) return
  const own = code.value.trim() && code.value !== LAB_WELCOME && !LAB_ALL.some(e => e.code === code.value)
  if (own && !window.confirm(`Заменить текущий код примером «${ex.title}»?`)) return
  setCode(ex.code)
  status.value = ex.real && mode.value !== 'real'
    ? `Пример «${ex.title}» загружен · включи «Реальные модели» и нажми Run (F5)`
    : `Пример «${ex.title}» загружен · нажми Run (F5)`
  nextTick(() => editor.value && editor.value.scrollToTop())
}

function clearEditor() {
  setCode('')
  if (editor.value) editor.value.focus()
}

function resetCode() {
  if (code.value !== LAB_WELCOME && !window.confirm('Вернуть стартовый код? Текущий текст будет заменён.')) return
  setCode(LAB_WELCOME)
}

function insertAtCursor(s) {
  if (editor.value) editor.value.insert(s)
  else setCode(code.value + s)
}

function gotoLine(m) {
  if (m.line === undefined || m.line === null || !editor.value) return
  editor.value.gotoLine(m.line)
}

/* ---------- жизненный цикл ---------- */
let prevTitle = ''
onMounted(() => {
  prevTitle = document.title
  document.title = 'Klerr — Transformers Lab'
  refreshCached()
})
onBeforeUnmount(() => {
  document.title = prevTitle
  cancel.value = true
  ml.stop()
})
</script>

<template>
  <div class="trainer-root lab-root">
    <header class="toolbar">
      <button class="ghost only-mobile" title="Модели" aria-label="Модели" @click="sideOpen = !sideOpen">☰</button>

      <RouterLink class="brand" to="/" title="На главную Klerr" aria-label="Klerr — на главную">
        <span class="brand-mark" aria-hidden="true"><KlerrMark /></span>
        <span class="brand-name">Klerr</span>
      </RouterLink>

      <button v-if="!running" class="run" @click="run">▶ Run</button>
      <button v-else class="run stop" @click="stop">■ Stop</button>

      <div class="seg" role="group" aria-label="Режим моделей">
        <button :class="{ on: mode === 'demo' }" :aria-pressed="mode === 'demo'" :disabled="running" @click="setMode('demo')">Демо</button>
        <button :class="{ on: mode === 'real' }" :aria-pressed="mode === 'real'" :disabled="running" @click="setMode('real')">
          Реальные<span class="lbl"> модели</span>
        </button>
      </div>

      <span class="spacer"></span>

      <LessonMenu :lessons="LAB_LESSONS" @pick="loadExample" />
      <button class="ghost" @click="clearEditor">Очистить</button>
      <button class="ghost danger" title="Вернуть стартовый код" @click="resetCode">Сброс</button>
    </header>

    <div class="body">
      <div id="backdrop" :class="{ show: sideOpen }" @click="sideOpen = false"></div>

      <ModelPanel
        :class="{ open: sideOpen }"
        :models="MODELS"
        :cached="cached"
        :loads="loads"
        :mode="mode"
        :busy="preloading || running"
        @download="downloadModel"
        @remove="removeModel"
        @mode="setMode"
        @refresh="refreshCached"
        @close="sideOpen = false"
      />

      <main ref="mainEl" :class="{ resizing: dragging }" :style="split !== null ? { '--ed-h': (split * 100).toFixed(2) + '%' } : null">
        <section class="editor-wrap">
          <SnippetBar :snippets="LAB_SNIPPETS" @insert="insertAtCursor" />
          <SqlEditor
            ref="editor"
            :model-value="code"
            :error-line="errorLine"
            :highlighter="highlightPy"
            comment="#"
            indent="    "
            block-colon
            aria-label="Редактор Python"
            placeholder="Пиши программу здесь.&#10;F5 или Ctrl+Enter — запуск, Ctrl+/ — закомментировать строки."
            @update:model-value="setCode"
            @run="run"
          />
        </section>

        <div
          class="splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Размер редактора и вывода"
          tabindex="0"
          title="Потяни, чтобы изменить размер. Двойной клик — по умолчанию"
          @pointerdown="startSplit"
          @pointermove="moveSplit"
          @pointerup="endSplit"
          @pointercancel="endSplit"
          @dblclick="resetSplit"
          @keydown="keySplit"
        ></div>

        <nav class="tabs">
          <button class="tab" :class="{ active: activeTab === 'output' }" @click="activeTab = 'output'">
            Output<span v-if="hadError" class="tab-err"> ⚠</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'help' }" @click="activeTab = 'help'">Справка</button>
          <span id="status" :class="{ err: hadError }">{{ status }}</span>
        </nav>

        <section ref="outEl" class="panel-out">
          <div v-show="activeTab === 'output'">
            <template v-for="(m, i) in messages" :key="i">
              <pre
                v-if="m.t === 'err'"
                class="msg err"
                :class="{ clickable: m.line !== undefined }"
                :title="m.line !== undefined ? 'Перейти к строке ' + (m.line + 1) : ''"
                @click="gotoLine(m)"
              >{{ m.m }}</pre>
              <p v-else-if="m.t === 'hint'" class="msg hint">
                <span class="hint-mark" aria-hidden="true">?</span>{{ m.m }}
              </p>
              <pre v-else class="msg" :class="m.t">{{ m.m }}</pre>
            </template>
            <div v-if="!messages.length && !running" class="placeholder">
              Нажми ▶ Run, и здесь появится вывод программы (print).
            </div>
            <div v-if="running" class="placeholder running">Выполняется…</div>
          </div>
          <div v-show="activeTab === 'help'">
            <LabHelp />
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
