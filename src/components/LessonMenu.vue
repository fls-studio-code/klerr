<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  lessons: { type: Array, default: () => [] },
})

const emit = defineEmits(['pick'])

const open = ref(false)
const btnEl = ref(null)
const popEl = ref(null)

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
  const w = Math.min(340, window.innerWidth - 24)
  p.style.width = w + 'px'
  let left = b.getBoundingClientRect().right - w
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12))
  p.style.left = left + 'px'
  p.style.top = (b.getBoundingClientRect().bottom + 6) + 'px'
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
      <button
        v-for="l in lessons"
        :key="l.id"
        class="menu-item"
        role="menuitem"
        @click="pick(l.id)"
      >
        <span class="mi-title">{{ l.title }}</span>
        <span class="mi-hint">{{ l.hint }}</span>
        <span v-if="l.needs" class="mi-needs">нужен урок «{{ l.needs }}»</span>
      </button>
    </div>
  </div>
</template>
