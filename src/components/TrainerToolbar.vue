<script setup>
import KlerrMark from './KlerrMark.vue'
import LessonMenu from './LessonMenu.vue'

defineProps({
  dbs: { type: Array, default: () => [] },
  current: { type: String, default: '' },
  ready: { type: Boolean, default: false },
  lessons: { type: Array, default: () => [] },
})

const emit = defineEmits(['run', 'pick', 'clear', 'reset', 'refresh', 'update:current', 'toggle-side'])
</script>

<template>
  <header class="toolbar">
    <button class="ghost only-mobile" title="Object Explorer" aria-label="Object Explorer" @click="emit('toggle-side')">☰</button>

    <RouterLink class="brand" to="/" title="На главную Klerr" aria-label="Klerr — на главную">
      <span class="brand-mark" aria-hidden="true"><KlerrMark /></span>
      <span class="brand-name">Klerr</span>
    </RouterLink>

    <button class="run" :disabled="!ready" @click="emit('run')">▶ Execute</button>

    <label class="dbsel">
      <span class="lbl">БД:</span>
      <select
        :value="current"
        aria-label="Текущая база данных"
        @change="emit('update:current', $event.target.value)"
      >
        <option v-for="db in dbs" :key="db" :value="db">{{ db }}</option>
      </select>
    </label>

    <button class="ghost" title="Обновить список баз и таблиц" @click="emit('refresh')">⟳ <span class="lbl">Refresh</span></button>

    <span class="spacer"></span>

    <LessonMenu :lessons="lessons" @pick="emit('pick', $event)" />
    <button class="ghost" @click="emit('clear')">Очистить</button>
    <button class="ghost danger" title="Удалить все базы и начать заново" @click="emit('reset')">Сброс</button>
  </header>
</template>
