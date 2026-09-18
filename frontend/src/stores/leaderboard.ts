import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '../services'
import { config } from '../config'
import type { Leaderboard, LeaderboardScope } from '../types'

export const useLeaderboardStore = defineStore('leaderboard', () => {
  const board = ref<Leaderboard | null>(null)
  const scope = ref<LeaderboardScope>('all')
  const loading = ref(false)
  const error = ref('')

  const podium = computed(() => board.value?.entries.slice(0, 3) ?? [])
  const rows = computed(() =>
    board.value?.entries.slice(3, 3 + config.leaderboardRows) ?? [],
  )

  async function load(next: LeaderboardScope = scope.value) {
    scope.value = next
    loading.value = true
    error.value = ''
    try {
      board.value = await api.getLeaderboard(next)
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se ha podido cargar el leaderboard.'
    } finally {
      loading.value = false
    }
  }

  return { board, scope, loading, error, podium, rows, load }
})
