<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const auth = useAuthStore()

/** La pantalla de acceso va a sangre; el resto lleva la cabecera. */
const showChrome = computed(() => auth.isAuthenticated && route.meta.chrome !== false)
</script>

<template>
  <div class="qa-shell">
    <AppHeader v-if="showChrome" />
    <main v-if="showChrome" class="qa-main">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </main>
    <RouterView v-else />
  </div>
</template>
