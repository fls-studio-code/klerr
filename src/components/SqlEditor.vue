<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { highlight } from '../editor/highlight.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  errorLine: { type: Number, default: null },
  placeholder: { type: String, default: '' },
  // Подсветка и поведение редактора подменяются для другого языка (мини-Python в лаборатории)
  highlighter: { type: Function, default: highlight },
  comment: { type: String, default: '--' },
  indent: { type: String, default: '  ' },
  blockColon: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Редактор SQL' },
})

const emit = defineEmits(['update:modelValue', 'run'])

const ta = ref(null)
const pre = ref(null)
const gutter = ref(null)
const lineH = ref(22.5)
const padTop = ref(12)

const html = computed(() => props.highlighter(props.modelValue, props.errorLine))
const lineCount = computed(() => props.modelValue.split('\n').length)
const numbers = computed(() => Array.from({ length: lineCount.value }, (_, i) => i + 1))

function measure() {
  const el = ta.value
  if (!el) return
  const cs = getComputedStyle(el)
  lineH.value = parseFloat(cs.lineHeight) || 22.5
  padTop.value = parseFloat(cs.paddingTop) || 12
}

function onScroll() {
  const el = ta.value
  if (!el) return
  if (pre.value) { pre.value.scrollTop = el.scrollTop; pre.value.scrollLeft = el.scrollLeft }
  if (gutter.value) gutter.value.scrollTop = el.scrollTop
}

function emitValue() {
  emit('update:modelValue', ta.value.value)
  nextTick(onScroll)
}

/** Вставка с сохранением истории Undo, где браузер это умеет. */
function insert(text) {
  const el = ta.value
  el.focus()
  let ok = false
  try { ok = document.execCommand('insertText', false, text) } catch (e) { ok = false }
  if (!ok) el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end')
  emitValue()
}

function lineBounds(el) {
  const v = el.value
  const a = v.lastIndexOf('\n', el.selectionStart - 1) + 1
  let b = v.indexOf('\n', Math.max(el.selectionEnd - (el.selectionEnd > el.selectionStart && v[el.selectionEnd - 1] === '\n' ? 1 : 0), el.selectionStart))
  if (b < 0) b = v.length
  return [a, b]
}

/** Заменить строки выделения результатом fn(lines). */
function editLines(fn) {
  const el = ta.value
  const [a, b] = lineBounds(el)
  const lines = el.value.slice(a, b).split('\n')
  const next = fn(lines).join('\n')
  el.setSelectionRange(a, b)
  insert(next)
  el.setSelectionRange(a, a + next.length)
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function toggleComment() {
  const c = escapeRe(props.comment)
  const uncomment = new RegExp('^(\\s*)' + c + ' ?')
  const commented = new RegExp('^\\s*' + c)
  editLines(lines => {
    const filled = lines.filter(l => l.trim())
    const all = filled.length && filled.every(l => commented.test(l))
    return lines.map(l => (all ? l.replace(uncomment, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1' + props.comment + ' ') : l))
  })
}

function onKeydown(e) {
  const el = ta.value
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'F5' || (mod && e.key === 'Enter')) {
    e.preventDefault()
    emit('run')
  } else if (mod && (e.key === '/' || e.code === 'Slash')) {
    e.preventDefault()
    toggleComment()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    const multi = el.value.slice(el.selectionStart, el.selectionEnd).includes('\n')
    const unindent = new RegExp('^( {1,' + props.indent.length + '}|\\t)')
    if (e.shiftKey) editLines(lines => lines.map(l => l.replace(unindent, '')))
    else if (multi) editLines(lines => lines.map(l => props.indent + l))
    else insert(props.indent)
  } else if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey && !e.isComposing) {
    const v = el.value
    const ls = v.lastIndexOf('\n', el.selectionStart - 1) + 1
    const before = v.slice(ls, el.selectionStart)
    let indent = (before.match(/^[ \t]*/) || [''])[0]
    // Python: после строки, оканчивающейся на «:», следующий блок сдвигается
    if (props.blockColon && /:\s*(#.*)?$/.test(before) && el.selectionStart === el.selectionEnd) indent += props.indent
    if (indent) { e.preventDefault(); insert('\n' + indent) }
  }
}

function selection() {
  const el = ta.value
  if (!el) return null
  const a = el.selectionStart, b = el.selectionEnd
  if (b <= a || !el.value.slice(a, b).trim()) return null
  return { text: el.value.slice(a, b), line: (el.value.slice(0, a).match(/\n/g) || []).length }
}

function gotoLine(line) {
  const el = ta.value
  if (!el) return
  measure()
  const lines = el.value.split('\n')
  const n = Math.max(0, Math.min(line, lines.length - 1))
  let a = 0
  for (let i = 0; i < n; i++) a += lines[i].length + 1
  el.focus()
  el.setSelectionRange(a, a + lines[n].length)
  const target = padTop.value + n * lineH.value - el.clientHeight / 3
  el.scrollTop = Math.max(0, target)
  onScroll()
}

function focus() { if (ta.value) ta.value.focus() }
function scrollToTop() { if (ta.value) { ta.value.scrollTop = 0; onScroll() } }

watch(() => props.modelValue, () => nextTick(onScroll))

defineExpose({ insert, selection, gotoLine, focus, scrollToTop, measure })

// размеры шрифта меняются на мобильных — перемеряем после монтирования и ресайза
onMounted(() => { measure(); window.addEventListener('resize', measure) })
onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <div class="ed">
    <div ref="gutter" class="ed-gutter" aria-hidden="true">
      <div
        v-for="n in numbers"
        :key="n"
        class="ed-ln"
        :class="{ err: errorLine !== null && n === errorLine + 1 }"
      >{{ n }}</div>
      <div class="ed-ln-pad"></div>
    </div>
    <div class="ed-code">
      <pre ref="pre" class="ed-hl" aria-hidden="true"><code v-html="html"></code></pre>
      <textarea
        id="editor"
        ref="ta"
        :value="modelValue"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        wrap="off"
        :placeholder="placeholder"
        :aria-label="ariaLabel"
        @input="emitValue"
        @scroll="onScroll"
        @keydown="onKeydown"
      ></textarea>
    </div>
  </div>
</template>
