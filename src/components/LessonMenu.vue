<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  lessons: { type: Array, default: () => [] },
})

const emit = defineEmits(['pick'])

const open = ref(false)
const btnEl = ref(null)
const popEl = ref(null)

/** «3.5 Students: SELECT, DISTINCT, TOP» по id примера */
function label(id) {
  for (const l of props.lessons) {
    const i = l.items.findIndex(x => x.id === id)
    if (i >= 0) return `${l.lesson}.${i + 1} ${l.items[i].title}`
  }
  return id
}

function toggle() {
  open.value = !open.value
  if (open.value) nextTick(place)
}

function close() {
  open.value = false
}

// Панель позиционируется по кнопке, но упирается в края окна,
// поэтому на узких экранах она не вылезает за пределы вьюпорта.
function place() {
  const b = btnEl.value
  const p = popEl.value
  if (!b || !p) return
  const w = Math.min(380, window.innerWidth - 24)
  const r = b.getBoundingClientRect()
  p.style.width = w + 'px'
  let left = r.right - w
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12))
  p.style.left = left + 'px'
  p.style.top = (r.bottom + 6) + 'px'
  p.style.maxHeight = Math.max(200, window.innerHeight - r.bottom - 18) + 'px'
}

function pick(id) {
  close()
  emit('pick', id)
}

function onDocPointer(e) {
  if (!open.value) return
  const p = popEl.value
  if (p && p.contains(e.target)) return
  if (btnEl.value && btnEl.value.contains(e.target)) return
  close()
}

function onKey(e) {
  if (e.key === 'Escape') close()
}

function onResize() {
  if (open.value) place()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="menu">
    <button
      ref="btnEl"
      class="ghost"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggle"
    >
      <span class="mi-label">Примеры</span>
      <svg class="menu-caret" :class="{ up: open }" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div v-if="open" ref="popEl" class="menu-pop" role="menu">
      <template v-for="l in lessons" :key="l.lesson">
        <div class="menu-group">{{ l.title }}</div>
        <button
          v-for="(item, i) in l.items"
          :key="item.id"
          class="menu-item"
          role="menuitem"
          @click="pick(item.id)"
        >
          <span class="mi-title"><span class="mi-num">{{ l.lesson }}.{{ i + 1 }}</span>{{ item.title }}</span>
          <span class="mi-hint">{{ item.hint }}</span>
          <span v-if="item.needs" class="mi-needs">сначала выполни «{{ label(item.needs) }}»</span>
        </button>
      </template>
    </div>
  </div>
</template>
