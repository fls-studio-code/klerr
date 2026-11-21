<script setup>
import { watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

function applyBodyClass(name) {
  document.body.classList.toggle('is-trainer', name === 'trainer')
}

watch(() => route.name, applyBodyClass, { immediate: true })
onUnmounted(() => document.body.classList.remove('is-trainer'))
</script>

<template>
  <RouterView v-slot="{ Component }">
    <component :is="Component" />
  </RouterView>
</template>
