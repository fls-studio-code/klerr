<script setup>
defineProps({
  sets: { type: Array, default: () => [] },
})

const MAX_ROWS = 1000

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
</script>

<template>
  <div v-for="(s, i) in sets" :key="i" class="rs">
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th class="rn"></th>
            <th v-for="c in s.cols" :key="c">{{ c }}</th>
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
