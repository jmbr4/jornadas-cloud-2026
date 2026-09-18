<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { formatPoints } from '../composables/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const game = useGameStore()

/** "Sets" queda activo también mientras juegas o ves el resultado. */
const lobbyActive = computed(() => ['lobby', 'play', 'result'].includes(String(route.name)))

async function logout() {
  game.abandon()
  await auth.logout()
  router.push({ name: 'auth' })
}
</script>

<template>
  <header class="qa-header">
    <div class="qa-brand">
      <i class="ph-fill ph-lightning" aria-hidden="true"></i>
      <span>Quiz Arena</span>
    </div>

    <nav class="qa-nav">
      <button
        type="button"
        class="qa-nav-link"
        :class="{ 'is-active': lobbyActive }"
        @click="router.push({ name: 'lobby' })"
      >
        Sets
      </button>
      <button
        type="button"
        class="qa-nav-link"
        :class="{ 'is-active': route.name === 'board' }"
        @click="router.push({ name: 'board' })"
      >
        Leaderboard
      </button>
      <!-- Esconderlo es comodidad, no seguridad: la ruta y la API se
           protegen aparte. -->
      <button
        v-if="auth.user?.isAdmin"
        type="button"
        class="qa-nav-link"
        :class="{ 'is-active': route.name === 'admin' }"
        @click="router.push({ name: 'admin' })"
      >
        Admin
      </button>
    </nav>

    <div class="qa-spacer"></div>

    <div class="qa-header-right">
      <div v-if="auth.user" class="qa-header-meta">
        <div class="qa-note">Puesto global</div>
        <div class="qa-header-rank">
          #{{ auth.user.globalRank }} · {{ formatPoints(auth.user.globalPoints) }} pts
        </div>
      </div>
      <div class="qa-avatar qa-avatar-user" :title="auth.user?.email">
        {{ auth.user?.initials }}
      </div>
      <button type="button" class="qa-btn-icon" title="Salir" @click="logout">
        <i class="ph ph-sign-out" style="font-size: 16px" aria-hidden="true"></i>
      </button>
    </div>
  </header>
</template>
