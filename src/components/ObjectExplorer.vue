<script setup>
defineProps({
  dbs: { type: Array, default: () => [] },
  current: { type: String, default: '' },
  expanded: { type: Object, default: () => new Set() },
  tablesFor: { type: Function, required: true },
  columnsFor: { type: Function, required: true },
})

const emit = defineEmits(['use', 'select', 'toggle', 'refresh', 'close'])
</script>

<template>
  <aside id="side">
    <div class="side-head">
      <b>Object Explorer</b>
      <button class="ghost sm" title="Обновить" @click="emit('refresh')">⟳</button>
      <button class="ghost sm only-mobile" aria-label="Закрыть" @click="emit('close')">✕</button>
    </div>

    <div id="tree">
      <div class="grp">Databases</div>

      <template v-for="name in dbs" :key="name">
        <div class="tree-node" :class="{ cur: name === current }">
          <button
            class="twisty"
            :class="{ open: expanded.has('db:' + name) }"
            :aria-label="expanded.has('db:' + name) ? 'Свернуть' : 'Развернуть'"
            @click="emit('toggle', 'db:' + name)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2c4.418 0 8 1.343 8 3s-3.582 3-8 3-8-1.343-8-3 3.582-3 8-3Z" />
            <path d="M4 5v14c0 1.657 3.582 3 8 3s8-1.343 8-3V5" />
          </svg>
          <span class="nm">{{ name }}</span>
          <span v-if="name === current" class="badge">active</span>
          <button v-else class="chip" @click.stop="emit('use', name)">USE</button>
        </div>

        <div v-if="expanded.has('db:' + name)" class="kids">
          <template v-if="tablesFor(name).length">
            <template v-for="t in tablesFor(name)" :key="t.name">
              <div class="tree-node">
                <button
                  class="twisty"
                  :class="{ open: expanded.has('db:' + name + '/' + t.name) }"
                  :aria-label="expanded.has('db:' + name + '/' + t.name) ? 'Свернуть' : 'Развернуть'"
                  @click="emit('toggle', 'db:' + name + '/' + t.name)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                <svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="t.type === 'view'" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                  <circle v-if="t.type === 'view'" cx="12" cy="12" r="3" />
                  <template v-else>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M9 10v10" />
                  </template>
                </svg>
                <span class="nm">dbo.{{ t.name }}</span>
                <button v-if="name === current" class="chip" @click.stop="emit('select', t.name)">SELECT</button>
              </div>

              <div v-if="expanded.has('db:' + name + '/' + t.name)" class="kids cols">
                <div v-for="c in columnsFor(name, t.name)" :key="c.name" class="col">
                  <span>{{ c.name }}</span>
                  <i>{{ c.type || '' }}{{ c.pk ? ' · PK' : '' }}{{ c.nn && !c.pk ? ' · NOT NULL' : '' }}</i>
                </div>
              </div>
            </template>
          </template>
          <div v-else class="empty">(нет таблиц)</div>
        </div>
      </template>
    </div>

    <p class="hint">Базы живут в памяти браузера и сохраняются на этом устройстве. Нажми «USE», чтобы переключиться, «SELECT» — чтобы вставить запрос.</p>
  </aside>
</template>
