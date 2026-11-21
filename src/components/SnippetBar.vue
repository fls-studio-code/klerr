<script setup>
defineProps({
  snippets: { type: Array, default: () => [] },
})

const emit = defineEmits(['insert'])
</script>

<template>
  <div class="snips" @mousedown.prevent>
    <button
      v-for="s in snippets"
      :key="s.label"
      @click="emit('insert', s.insert)"
    >{{ s.label }}</button>
  </div>
</template>
