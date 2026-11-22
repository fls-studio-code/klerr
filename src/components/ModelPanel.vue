<script setup>
import { computed } from 'vue'

const props = defineProps({
  models: { type: Array, default: () => [] },
  cached: { type: Object, default: () => new Set() },
  loads: { type: Object, default: () => ({}) },
  mode: { type: String, default: 'demo' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['download', 'remove', 'mode', 'close', 'refresh'])

const rows = computed(() => props.models.map((m) => {
  const load = props.loads[m.hub]
  const loading = !!load && load.state === 'loading'
  return {
    ...m,
    inCache: props.cached.has(m.hub),
    loading,
    failed: !!load && load.state === 'error',
    pct: load ? Math.round(load.pct) : 0,
    loadedMB: load ? (load.loaded / 1e6).toFixed(0) : '0',
    totalMB: load && load.total ? (load.total / 1e6).toFixed(0) : String(m.sizeMB),
  }
}))
</script>

<template>
  <aside id="side">
    <div class="side-head">
      <b>Модели</b>
      <button class="ghost sm" title="Проверить, что скачано" @click="emit('refresh')">⟳</button>
      <button class="ghost sm only-mobile" aria-label="Закрыть" @click="emit('close')">✕</button>
    </div>

    <div class="mp-scroll">
      <div class="mp-mode" role="group" aria-label="Режим моделей">
        <button :class="{ on: mode === 'demo' }" :aria-pressed="mode === 'demo'" @click="emit('mode', 'demo')">
          <b>Демо</b>
          <span>игрушечные модели, работают сразу и без интернета</span>
        </button>
        <button :class="{ on: mode === 'real' }" :aria-pressed="mode === 'real'" @click="emit('mode', 'real')">
          <b>Реальные модели</b>
          <span>настоящие нейросети, скачиваются один раз</span>
        </button>
      </div>

      <div class="grp">Каталог (ONNX для браузера)</div>

      <div v-for="m in rows" :key="m.hub" class="mp-card">
        <div class="mp-title">{{ m.title }}</div>
        <div class="mp-kind">{{ m.kind }}</div>
        <code class="mp-hub">{{ m.hub }}</code>
        <p class="mp-note">{{ m.note }}</p>

        <div v-if="m.loading" class="mp-bar" role="progressbar" :aria-valuenow="m.pct" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: m.pct + '%' }"></span>
        </div>

        <div class="mp-foot">
          <span v-if="m.loading" class="mp-state">Скачивание: {{ m.pct }}% · {{ m.loadedMB }} из {{ m.totalMB }} МБ</span>
          <span v-else-if="m.inCache" class="badge">в кэше</span>
          <span v-else-if="m.failed" class="mp-state mp-err">не удалось скачать</span>
          <span v-else class="mp-state">≈ {{ m.sizeMB }} МБ</span>

          <button
            v-if="m.inCache && !m.loading"
            class="ghost sm danger"
            title="Удалить из кэша браузера"
            @click="emit('remove', m.hub)"
          >Удалить</button>
          <button
            v-else-if="!m.loading"
            class="sm mp-dl"
            :disabled="busy"
            @click="emit('download', m)"
          >Скачать</button>
        </div>
      </div>
    </div>

    <p class="hint">
      Модели скачиваются с huggingface.co, движок ONNX Runtime с cdn.jsdelivr.net.
      Дальше они лежат в кэше браузера и работают без повторной загрузки. Режим инкогнито кэш не сохраняет.
    </p>
  </aside>
</template>
