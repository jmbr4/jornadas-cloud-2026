<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const state = ref<'checking' | 'failed'>('checking')

/**
 * Pantalla a la que lleva el enlace del correo: canjea el token y entra.
 *
 * Se navega con `replace`, así que el token no queda en el historial del
 * navegador ni se puede volver a él con el botón de atrás.
 */
onMounted(async () => {
  const token = String(route.query['token'] ?? '')
  if (!token) {
    state.value = 'failed'
    auth.error = 'Este enlace no trae ningún código de acceso.'
    return
  }

  if (!(await auth.verify(token))) {
    state.value = 'failed'
    return
  }
  // Si es la primera vez, toca elegir nombre y handle antes de jugar.
  router.replace({ name: auth.user?.profileComplete ? 'lobby' : 'profile' })
})
</script>

<template>
  <div class="qa-center">
    <div class="qa-panel qa-panel-raised qa-auth-form">
      <div class="qa-brand">
        <i class="ph-fill ph-lightning" aria-hidden="true"></i>
        <span>Quiz Arena</span>
      </div>

      <template v-if="state === 'checking'">
        <div class="qa-auth-badge">
          <i class="ph ph-key" aria-hidden="true"></i>
        </div>
        <div>
          <div class="qa-auth-heading">Comprobando tu enlace</div>
          <div class="qa-auth-sub">Un momento.</div>
        </div>
      </template>

      <template v-else>
        <div>
          <div class="qa-auth-heading">Este enlace ya no vale</div>
          <div class="qa-auth-sub">
            {{ auth.error || 'Ha caducado o ya se ha usado. Pide uno nuevo, tarda un segundo.' }}
          </div>
        </div>
        <button type="button" class="qa-btn qa-btn-lg" @click="router.replace({ name: 'auth' })">
          <i class="ph ph-arrow-left" aria-hidden="true"></i> Pedir otro enlace
        </button>
      </template>
    </div>
  </div>
</template>
