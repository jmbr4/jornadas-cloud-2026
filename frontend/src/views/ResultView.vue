<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useCatalogStore } from '../stores/catalog'
import { formatSeconds } from '../composables/format'

const router = useRouter()
const game = useGameStore()
const catalog = useCatalogStore()

/** Sin resumen no hay nada que enseñar: vuelta al lobby. */
onMounted(() => {
  if (!game.summary) router.replace({ name: 'lobby' })
  else catalog.load(true)
})

const headline = computed(() => {
  const s = game.summary
  if (!s) return ''
  if (s.hits === s.total) return 'Pleno. Nadie ha fallado menos que tú.'
  const missing = s.total - s.hits
  if (s.hits >= 3) {
    return `Buen set. Te falta${missing === 1 ? '' : 'n'} ${missing} para el pleno.`
  }
  return 'Set duro. Repítelo y recupera posiciones.'
})
</script>

<template>
  <div v-if="game.summary" class="qa-result qa-in">
    <div class="qa-kicker">Set completado · {{ game.summary.setTitle }}</div>
    <h1 class="qa-h1" style="font-size: 36px; margin-bottom: var(--space-8)">{{ headline }}</h1>

    <div class="qa-result-grid">
      <div class="qa-result-card">
        <div class="qa-result-value is-accent">{{ game.summary.score }}</div>
        <div class="qa-stat-note">puntos</div>
      </div>
      <div class="qa-result-card">
        <div class="qa-result-value">{{ game.summary.hits }}</div>
        <div class="qa-stat-note">aciertos</div>
      </div>
      <div class="qa-result-card">
        <div class="qa-result-value">{{ formatSeconds(game.summary.averageSeconds) }}</div>
        <div class="qa-stat-note">tiempo medio</div>
      </div>
      <div class="qa-result-card">
        <div class="qa-result-value">#{{ game.summary.setRank }}</div>
        <div class="qa-stat-note">puesto en el set</div>
      </div>
    </div>

    <div class="qa-row">
      <button type="button" class="qa-btn" @click="router.push({ name: 'board' })">
        <i class="ph ph-ranking" aria-hidden="true"></i> Ver leaderboard
      </button>
      <button type="button" class="qa-btn qa-btn-quiet" @click="router.push({ name: 'lobby' })">
        Otro set
      </button>
    </div>
  </div>
</template>
