<script setup>
defineProps({
  href: { type: String, required: true },
  cover: { type: String, required: true },
  name: { type: String, required: true },
})
</script>

<template>
  <a class="game" :href="href" target="_blank" rel="noopener noreferrer">
    <span class="game-cover">
      <img
        :src="cover"
        :alt="`${name} — обложка игры`"
        width="58"
        height="58"
        loading="lazy"
        decoding="async"
      >
    </span>
    <span class="game-text">
      <span class="game-name">{{ name }}</span>
      <span class="game-meta">
        Roblox · открыть
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </span>
    </span>
  </a>
</template>
