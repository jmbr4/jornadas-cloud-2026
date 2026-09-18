<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SetCard from '../components/SetCard.vue'
import { useCatalogStore } from '../stores/catalog'
import { useLeaderboardStore } from '../stores/leaderboard'
import { formatPoints, formatSeconds } from '../composables/format'

const router = useRouter()
const catalog = useCatalogStore()
const leaderboard = useLeaderboardStore()

onMounted(() => {
  catalog.load()
  leaderboard.load('all')
})

const activeSets = computed(() => catalog.sets.length)
const players = computed(() => leaderboard.board?.totalPlayers ?? 0)
const myAverage = computed(() => {
  const me = leaderboard.board?.entries.find((e) => e.isMe)
  return me ? formatSeconds(me.averageSeconds) : '—'
})

function start(setId: string) {
  router.push({ name: 'play', params: { setId } })
}
</script>

<template>
  <div class="qa-in">
    <div class="qa-lobby-head">
      <div style="max-width: 560px">
        <div class="qa-kicker">
          {{ catalog.sets.length }} sets · {{ catalog.totalQuestions }} preguntas
        </div>
        <h1 class="qa-h1">Elige tu set y sube posiciones</h1>
        <p class="qa-muted" style="margin: 0; text-wrap: pretty">
          Cada set son 5 preguntas cronometradas. Aciertas, puntúas; respondes rápido, puntúas más.
          El leaderboard se recalcula al terminar.
        </p>
      </div>

      <div class="qa-spacer"></div>

      <div class="qa-stat-band">
        <div>
          <div class="qa-stat-value">{{ activeSets }}</div>
          <div class="qa-stat-note">sets activos</div>
        </div>
        <div>
          <div class="qa-stat-value">{{ formatPoints(players) }}</div>
          <div class="qa-stat-note">devs compitiendo</div>
        </div>
        <div>
          <div class="qa-stat-value">{{ myAverage }}</div>
          <div class="qa-stat-note">tu tiempo medio</div>
        </div>
      </div>
    </div>

    <p v-if="catalog.error" class="qa-error">
      <i class="ph ph-warning-circle" aria-hidden="true"></i> {{ catalog.error }}
    </p>

    <div v-if="catalog.loading && !catalog.sets.length" class="qa-empty">Cargando sets…</div>

    <div v-else class="qa-set-grid">
      <SetCard v-for="set in catalog.sets" :key="set.id" :set="set" @start="start" />
    </div>
  </div>
</template>
