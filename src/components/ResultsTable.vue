<script setup>
import { ref } from 'vue'

defineProps({
  sets: { type: Array, default: () => [] },
})

const MAX_ROWS = 1000
const copied = ref(-1)

function isBinary(v) {
  return typeof Uint8Array !== 'undefined' && v instanceof Uint8Array
}

function cellClass(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return 'num'
  if (isBinary(v)) return 'bin'
  return ''
}

function cellText(v) {
  if (v === null || v === undefined) return 'NULL'
  if (isBinary(v)) return '0x' + Array.from(v).map(x => x.toString(16).padStart(2, '0')).join('')
  return String(v)
}

/** Копирует набор как TSV — вставляется в Excel/Google Таблицы по ячейкам. */
async function copySet(s, i) {
  const clean = v => cellText(v).replace(/[\t\n\r]+/g, ' ')
  const tsv = [s.cols.join('\t'), ...s.rows.map(r => r.map(clean).join('\t'))].join('\n')
  try {
    await navigator.clipboard.writeText(tsv)
    copied.value = i
    setTimeout(() => { if (copied.value === i) copied.value = -1 }, 1500)
  } catch (e) { /* буфер обмена недоступен */ }
}
</script>

<template>
  <div v-for="(s, i) in sets" :key="i" class="rs">
    <div class="rs-head">
      <span class="rs-title">Результат {{ i + 1 }}</span>
      <span class="rs-count">{{ s.rows.length }} {{ s.rows.length % 10 === 1 && s.rows.length % 100 !== 11 ? 'строка' : (s.rows.length % 10 >= 2 && s.rows.length % 10 <= 4 && (s.rows.length % 100 < 10 || s.rows.length % 100 >= 20) ? 'строки' : 'строк') }}</span>
      <button class="ghost sm rs-copy" :title="'Скопировать как таблицу (TSV)'" @click="copySet(s, i)">
        {{ copied === i ? 'Скопировано' : 'Копировать' }}
      </button>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th class="rn"></th>
            <th v-for="(c, ci) in s.cols" :key="ci">{{ c }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in s.rows.slice(0, MAX_ROWS)" :key="ri">
            <td class="rn">{{ ri + 1 }}</td>
            <td v-for="(v, ci) in row" :key="ci" :class="cellClass(v)">{{ cellText(v) }}</td>
          </tr>
          <tr v-if="!s.rows.length">
            <td class="rn"></td>
            <td :colspan="Math.max(1, s.cols.length)" class="null">(0 rows)</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="s.rows.length > MAX_ROWS" class="rs-note">
      Показаны первые {{ MAX_ROWS }} из {{ s.rows.length }} строк.
    </div>
  </div>
</template>
