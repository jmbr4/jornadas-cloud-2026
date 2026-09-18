<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PodiumColumn from '../components/PodiumColumn.vue'
import { useLeaderboardStore } from '../stores/leaderboard'
import { useCatalogStore } from '../stores/catalog'
import { formatPercent, formatPoints, formatSeconds } from '../composables/format'

const leaderboard = useLeaderboardStore()
const catalog = useCatalogStore()

onMounted(async () => {
  await catalog.load()
  await leaderboard.load()
})

/** Global más un ámbito por set del catálogo. */
const scopes = computed(() => [
  { id: 'all', label: 'Global' },
  ...catalog.sets.map((s) => ({ id: s.id, label: s.category })),
])

/** El podio se dibuja 2 · 1 · 3 para que el primero quede en el centro. */
const podiumOrder = computed(() => {
  const [first, second, third] = leaderboard.podium
  return [second, first, third].filter(Boolean)
})

const scopeNote = computed(() => {
  const board = leaderboard.board
  if (!board) return ''
  const where =
    board.scope === 'all'
      ? 'Suma de los tres sets de la temporada'
      : `Solo ${scopes.value.find((s) => s.id === board.scope)?.label ?? board.scope}`
  return `${where} · estás en el puesto #${board.myRank ?? '—'} de ${board.totalPlayers}`
})
</script>

<template>
  <div class="qa-in">
    <div class="qa-board-head">
      <div>
        <h1 class="qa-h1" style="font-size: 34px; margin-bottom: var(--space-2)">Leaderboard</h1>
        <p class="qa-muted" style="margin: 0; font-size: 14px">{{ scopeNote }}</p>
      </div>

      <div class="qa-spacer"></div>

      <div class="qa-seg">
        <button
          v-for="scope in scopes"
          :key="scope.id"
          type="button"
          class="qa-seg-opt"
          :class="{ 'is-active': leaderboard.scope === scope.id }"
          @click="leaderboard.load(scope.id)"
        >
          {{ scope.label }}
        </button>
      </div>
    </div>

    <div v-if="leaderboard.loading && !leaderboard.board" class="qa-empty">
      Cargando clasificación…
    </div>

    <template v-else>
      <div class="qa-podium">
        <PodiumColumn v-for="entry in podiumOrder" :key="entry!.userId" :entry="entry!" />
      </div>

      <div class="qa-listbox">
        <div class="qa-table-head">
          <div>Puesto</div>
          <div>Dev</div>
          <div style="text-align: right">Puntos</div>
          <div style="text-align: right">Tiempo medio</div>
          <div style="text-align: right">Aciertos</div>
        </div>

        <div
          v-for="row in leaderboard.rows"
          :key="row.userId"
          class="qa-table-row"
          :class="{ 'is-me': row.isMe }"
        >
          <div class="qa-cell-rank">#{{ row.rank }}</div>
          <div class="qa-cell-dev">
            <span class="qa-avatar qa-avatar-sm" :class="{ 'qa-avatar-me': row.isMe }">
              {{ row.initials }}
            </span>
            <span style="min-width: 0">
              <span class="qa-cell-name">{{ row.name }}</span>
              <span class="qa-cell-handle">{{ row.handle }}</span>
            </span>
          </div>
          <div class="qa-cell-num">{{ formatPoints(row.points) }}</div>
          <div class="qa-cell-sec">{{ formatSeconds(row.averageSeconds) }}</div>
          <div class="qa-cell-sec">{{ formatPercent(row.accuracy) }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
