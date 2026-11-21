<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { createEngine } from '../engine/tsql.js'
import { loadSqlJs } from '../engine/sqljs.js'
import { LESSONS } from '../lessons.js'
import '../styles/trainer.css'
import TrainerToolbar from '../components/TrainerToolbar.vue'
import ObjectExplorer from '../components/ObjectExplorer.vue'
import SnippetBar from '../components/SnippetBar.vue'
import ResultsTable from '../components/ResultsTable.vue'

const SNIPPETS = [
  { label: 'SELECT', insert: 'SELECT * FROM ' },
  { label: 'INSERT', insert: 'INSERT INTO ' },
  { label: 'CREATE TABLE', insert: 'CREATE TABLE ' },
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
const activeTab = ref('results')
const status = ref('Загрузка движка…')
const text = ref('')
const sideOpen = ref(false)
const editorEl = ref(null)
const tick = ref(0)

function sync() {
  tick.value++
  dbs.value = engine.getDbs().sort((a, b) =>
    a === 'master' ? -1 : b === 'master' ? 1 : a.localeCompare(b),
  )
  current.value = engine.getCurrent()
  expanded.value = new Set(engine.getOpenKeys())
}

// Читаем tick.value, чтобы computed зависел от состояния движка
const tablesFor = (name) => { tick.value; return engine.getTables(name) }
const columnsFor = (name, table) => { tick.value; return engine.getColumns(name, table) }

function run() {
  if (!ready.value) return

  const el = editorEl.value
  let payload = text.value
  let selectionOnly = false

  if (el) {
    const a = el.selectionStart
    const b = el.selectionEnd
    if (b > a && el.value.slice(a, b).trim()) {
      payload = el.value.slice(a, b)
      selectionOnly = true
    }
  }

  const res = engine.execute(payload, { selectionOnly })

  if (res.empty) {
    status.value = 'Нечего выполнять'
    return
  }

  results.value = res.sets
  messages.value = res.log
  hadError.value = res.hadErr
  activeTab.value = res.hadErr || !res.sets.length ? 'messages' : 'results'
  status.value = `${res.hadErr ? 'Ошибка' : 'Готово'} · ${res.ms} мс · БД: ${engine.getCurrent()}`
  sync()
}

function loadLesson(id) {
  const lesson = LESSONS.find(l => l.id === id)
  if (!lesson) return

  const sql = lesson.fromEngine ? engine.getSample() : lesson.sql
  if (text.value.trim() && !confirm(`Заменить текущий текст примером «${lesson.title}»?`)) return

  text.value = sql
  engine.setText(sql)
  nextTick(() => { if (editorEl.value) editorEl.value.scrollTop = 0 })
}

function clearEditor() {
  text.value = ''
  engine.setText('')
  if (editorEl.value) editorEl.value.focus()
}

function resetAll() {
  if (!confirm('Удалить ВСЕ базы и таблицы на этом устройстве?')) return
  engine.resetAll()
  results.value = []
  messages.value = [{ t: 'ok', m: 'Всё сброшено.' }]
  hadError.value = false
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
  const el = editorEl.value
  if (!el) {
    text.value += s
    return
  }
  const a = el.selectionStart
  const b = el.selectionEnd
  el.setRangeText(s, a, b, 'end')
  el.focus()
  text.value = el.value
  engine.setText(text.value)
}

function insertSelect(table) {
  insertAtCursor('SELECT * FROM ' + table + '\n')
}

function onKeydown(e) {
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
    e.preventDefault()
    run()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    insertAtCursor('  ')
  }
}

function onInput(value) {
  text.value = value
  engine.setText(value)
}

onMounted(async () => {
  try {
    const initSqlJs = await loadSqlJs()
    await engine.init(initSqlJs)
    text.value = engine.getText()
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

      <main>
        <section class="editor-wrap">
          <SnippetBar :snippets="SNIPPETS" @insert="insertAtCursor" />
          <textarea
            id="editor"
            ref="editorEl"
            :value="text"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            placeholder="Пиши запросы здесь.&#10;Выдели часть текста — выполнится только выделенное.&#10;F5 или Ctrl+Enter — Execute."
            @input="onInput($event.target.value)"
            @keydown="onKeydown"
          ></textarea>
        </section>

        <nav class="tabs">
          <button class="tab" :class="{ active: activeTab === 'results' }" @click="activeTab = 'results'">Results</button>
          <button class="tab" :class="{ active: activeTab === 'messages' }" @click="activeTab = 'messages'">
            Messages<span v-if="hadError"> ⚠</span>
          </button>
          <span id="status">{{ status }}</span>
        </nav>

        <section class="panel-out">
          <div v-show="activeTab === 'results'">
            <ResultsTable v-if="results.length" :sets="results" />
            <div v-else class="placeholder">Здесь появятся результаты запросов.</div>
          </div>
          <div v-show="activeTab === 'messages'">
            <pre v-for="(m, i) in messages" :key="i" class="msg" :class="m.t">{{ m.m }}</pre>
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
