<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { createEngine } from '../engine/tsql.js'
import { loadSqlJs } from '../engine/sqljs.js'
import { LESSONS, WELCOME, ALL_EXAMPLES, findExample } from '../lessons.js'
import '../styles/trainer.css'
import TrainerToolbar from '../components/TrainerToolbar.vue'
import ObjectExplorer from '../components/ObjectExplorer.vue'
import SnippetBar from '../components/SnippetBar.vue'
import ResultsTable from '../components/ResultsTable.vue'
import SqlEditor from '../components/SqlEditor.vue'

const SNIPPETS = [
  { label: 'SELECT', insert: 'SELECT * FROM ' },
  { label: 'WHERE', insert: 'WHERE ' },
  { label: 'AND', insert: ' AND ' },
  { label: 'OR', insert: ' OR ' },
  { label: 'ORDER BY', insert: 'ORDER BY ' },
  { label: 'TOP', insert: 'TOP (10) ' },
  { label: 'DISTINCT', insert: 'DISTINCT ' },
  { label: 'LIKE', insert: "LIKE '%'" },
  { label: 'IN', insert: 'IN ()' },
  { label: 'BETWEEN', insert: 'BETWEEN  AND ' },
  { label: 'IS NULL', insert: 'IS NULL' },
  { label: 'INSERT', insert: 'INSERT INTO  () VALUES ();' },
  { label: 'UPDATE', insert: 'UPDATE  SET  = WHERE ;' },
  { label: 'DELETE', insert: 'DELETE FROM  WHERE ;' },
  { label: 'CREATE TABLE', insert: 'CREATE TABLE  (\n  Id INT IDENTITY(1,1) PRIMARY KEY,\n  \n);' },
  { label: 'ALTER TABLE', insert: 'ALTER TABLE  ADD ' },
  { label: 'PRIMARY KEY', insert: 'PRIMARY KEY' },
  { label: 'FOREIGN KEY', insert: 'FOREIGN KEY () REFERENCES ()' },
  { label: 'CREATE DB', insert: 'CREATE DATABASE ' },
  { label: 'USE', insert: 'USE ' },
  { label: 'GO', insert: '\nGO\n' },
  { label: '*', insert: '*' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: "'", insert: "'" },
  { label: ',', insert: ',' },
  { label: ';', insert: ';' },
  { label: '=', insert: '=' },
]

const engine = createEngine({
  locateFile: (f) => `${import.meta.env.BASE_URL}vendor/sql/${f}`,
})

const ready = ref(false)
const loadError = ref('')
const dbs = ref([])
const current = ref('master')
const expanded = ref(new Set())
const results = ref([])
const messages = ref([])
const hadError = ref(false)
const errorLine = ref(null)
const activeTab = ref('results')
const status = ref('Загрузка движка…')
const text = ref('')
const sideOpen = ref(false)
const editor = ref(null)
const tick = ref(0)
const mainEl = ref(null)

/* ---------- разделитель редактора и результатов ---------- */
const LS_SPLIT = 'klerr_split'
const split = ref(readSplit())
const dragging = ref(false)

function readSplit() {
  try { const v = parseFloat(localStorage.getItem(LS_SPLIT)); return v > 0 && v < 1 ? v : null } catch (e) { return null }
}
function saveSplit() {
  try { if (split.value === null) localStorage.removeItem(LS_SPLIT); else localStorage.setItem(LS_SPLIT, String(split.value)) } catch (e) { /* хранилище недоступно */ }
}
function setSplitFromY(y) {
  const m = mainEl.value
  if (!m) return
  const r = m.getBoundingClientRect()
  const min = 90, max = r.height - 110
  split.value = Math.min(max, Math.max(min, y - r.top)) / r.height
}
function startSplit(e) {
  if (e.button !== undefined && e.button !== 0) return
  e.preventDefault()
  dragging.value = true
  e.currentTarget.setPointerCapture(e.pointerId)
}
function moveSplit(e) { if (dragging.value) setSplitFromY(e.clientY) }
function endSplit() {
  if (!dragging.value) return
  dragging.value = false
  saveSplit()
}
function keySplit(e) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const m = mainEl.value
  const r = m.getBoundingClientRect()
  const cur = (split.value ?? 0.4) * r.height + r.top
  setSplitFromY(cur + (e.key === 'ArrowUp' ? -24 : 24))
  saveSplit()
}
function resetSplit() { split.value = null; saveSplit() }

function sync() {
  tick.value++
  dbs.value = engine.getDbs().sort((a, b) =>
    a === 'master' ? -1 : b === 'master' ? 1 : a.localeCompare(b),
  )
  current.value = engine.getCurrent()
  expanded.value = new Set(engine.getOpenKeys())
}

// Как в SSMS: сначала dbo, потом остальные схемы по алфавиту
const sortKey = n => (n.includes('.') ? n : 'dbo.' + n).toLowerCase()

// Читаем tick.value, чтобы шаблон перерисовывался после изменений в движке
const tablesFor = (name) => { tick.value; return engine.getTables(name).sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name))) }
const columnsFor = (name, table) => { tick.value; return engine.getColumns(name, table) }

function run() {
  if (!ready.value) return

  const sel = editor.value ? editor.value.selection() : null
  const payload = sel ? sel.text : text.value
  const res = engine.execute(payload, { selectionOnly: !!sel, lineOffset: sel ? sel.line : 0 })

  if (res.empty) {
    status.value = 'Нечего выполнять'
    return
  }

  results.value = res.sets
  messages.value = res.log
  hadError.value = res.hadErr
  errorLine.value = res.hadErr ? res.errLine : null
  activeTab.value = res.hadErr || !res.sets.length ? 'messages' : 'results'
  const rows = res.sets.reduce((n, s) => n + s.rows.length, 0)
  status.value = res.hadErr
    ? `Ошибка в строке ${res.errLine + 1} · ${res.ms} мс · БД: ${engine.getCurrent()}`
    : `Готово · ${res.sets.length ? rows + ' стр. · ' : ''}${res.ms} мс · БД: ${engine.getCurrent()}`
  sync()
}

function setText(value) {
  text.value = value
  engine.setText(value)
  errorLine.value = null
}

function loadLesson(id) {
  const ex = findExample(id)
  if (!ex) return
  // Спрашиваем, только если в редакторе свой текст, а не стартовый или другой пример
  const own = text.value.trim() && text.value !== WELCOME && !ALL_EXAMPLES.some(e => e.sql === text.value)
  if (own && !confirm(`Заменить текущий текст примером «${ex.title}»?`)) return
  setText(ex.sql)
  status.value = `Пример «${ex.title}» загружен — нажми Execute (F5)`
  nextTick(() => editor.value && editor.value.scrollToTop())
}

function clearEditor() {
  setText('')
  if (editor.value) editor.value.focus()
}

function resetAll() {
  if (!confirm('Удалить ВСЕ базы и таблицы на этом устройстве?')) return
  engine.resetAll()
  results.value = []
  messages.value = [{ t: 'ok', m: 'Всё сброшено.' }]
  hadError.value = false
  errorLine.value = null
  activeTab.value = 'messages'
  status.value = 'Сброс выполнен'
  sync()
}

function refresh() {
  sync()
  status.value = 'Список обновлён · БД: ' + engine.getCurrent()
}

function changeDb(name) {
  if (!engine.setCurrent(name)) return
  sync()
  status.value = 'USE ' + engine.getCurrent()
}

function toggleKey(key) {
  engine.toggleKey(key)
  expanded.value = new Set(engine.getOpenKeys())
}

function insertAtCursor(s) {
  if (editor.value) editor.value.insert(s)
  else setText(text.value + s)
}

function insertSelect(table) {
  insertAtCursor('SELECT TOP (1000) * FROM ' + table + ';\n')
  sideOpen.value = false
}

function gotoLine(m) {
  if (m.line === undefined || m.line === null || !editor.value) return
  editor.value.gotoLine(m.line)
}

onMounted(async () => {
  try {
    const initSqlJs = await loadSqlJs()
    await engine.init(initSqlJs)
    const saved = engine.getText()
    text.value = saved || WELCOME
    ready.value = true
    status.value = 'Готово · БД: ' + engine.getCurrent()
    sync()
  } catch (e) {
    loadError.value = (e && e.message) ? e.message : String(e)
    status.value = 'Ошибка загрузки движка'
  }
})
</script>

<template>
  <div class="trainer-root">
    <TrainerToolbar
      :dbs="dbs"
      :current="current"
      :ready="ready"
      :lessons="LESSONS"
      @run="run"
      @pick="loadLesson"
      @clear="clearEditor"
      @reset="resetAll"
      @refresh="refresh"
      @update:current="changeDb"
      @toggle-side="sideOpen = !sideOpen"
    />

    <div class="body">
      <div id="backdrop" :class="{ show: sideOpen }" @click="sideOpen = false"></div>

      <ObjectExplorer
        :class="{ open: sideOpen }"
        :dbs="dbs"
        :current="current"
        :expanded="expanded"
        :tables-for="tablesFor"
        :columns-for="columnsFor"
        @use="changeDb"
        @select="insertSelect"
        @toggle="toggleKey"
        @refresh="refresh"
        @close="sideOpen = false"
      />

      <main ref="mainEl" :class="{ resizing: dragging }" :style="split !== null ? { '--ed-h': (split * 100).toFixed(2) + '%' } : null">
        <section class="editor-wrap">
          <SnippetBar :snippets="SNIPPETS" @insert="insertAtCursor" />
          <SqlEditor
            ref="editor"
            :model-value="text"
            :error-line="errorLine"
            placeholder="Пиши запросы здесь.&#10;Выдели часть текста — выполнится только выделенное.&#10;F5 или Ctrl+Enter — Execute, Ctrl+/ — закомментировать строки."
            @update:model-value="setText"
            @run="run"
          />
        </section>

        <div
          class="splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Размер редактора и результатов"
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
          <button class="tab" :class="{ active: activeTab === 'results' }" @click="activeTab = 'results'">
            Results<span v-if="results.length" class="tab-count">{{ results.length }}</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'messages' }" @click="activeTab = 'messages'">
            Messages<span v-if="hadError" class="tab-err"> ⚠</span>
          </button>
          <span id="status" :class="{ err: hadError }">{{ status }}</span>
        </nav>

        <section class="panel-out">
          <div v-show="activeTab === 'results'">
            <ResultsTable v-if="results.length" :sets="results" />
            <div v-else class="placeholder">Здесь появятся результаты запросов.</div>
          </div>
          <div v-show="activeTab === 'messages'">
            <template v-for="(m, i) in messages" :key="i">
              <pre
                v-if="m.t === 'err'"
                class="msg err clickable"
                :title="'Перейти к строке ' + (m.line + 1)"
                @click="gotoLine(m)"
              >{{ m.m }}</pre>
              <p v-else-if="m.t === 'hint'" class="msg hint">
                <span class="hint-mark" aria-hidden="true">?</span>{{ m.m }}
              </p>
              <pre v-else class="msg" :class="m.t">{{ m.m }}</pre>
            </template>
            <div v-if="!messages.length" class="placeholder">Сообщений нет.</div>
          </div>
        </section>
      </main>
    </div>

    <div v-if="loadError" class="load-error">
      Движок не загрузился: {{ loadError }}. Проверь, что папка public/vendor/sql собралась (npm run build).
    </div>
  </div>
</template>
