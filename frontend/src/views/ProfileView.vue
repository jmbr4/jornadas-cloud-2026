<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../services'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const name = ref('')
const handle = ref('')
const error = ref('')
const saving = ref(false)

/** Igual que en el servidor: minúsculas, sin arroba, sin acentos ni espacios. */
const cleanHandle = computed(() =>
  handle.value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''),
)

const valid = computed(
  () => name.value.trim().length >= 2 && /^[a-z0-9_]{3,20}$/.test(cleanHandle.value),
)

async function submit() {
  if (!valid.value || saving.value) return
  error.value = ''
  saving.value = true
  try {
    auth.user = await api.createProfile(name.value, cleanHandle.value)
    router.replace({ name: 'lobby' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No se ha podido guardar.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="qa-center">
    <form class="qa-panel qa-panel-raised qa-auth-form" @submit.prevent="submit">
      <div class="qa-brand">
        <i class="ph-fill ph-lightning" aria-hidden="true"></i>
        <span>Quiz Arena</span>
      </div>

      <div>
        <div class="qa-auth-heading">Elige cómo te verán</div>
        <div class="qa-auth-sub">
          Esto es lo que aparece en el leaderboard. Tu correo no se muestra nunca.
        </div>
      </div>

      <label class="qa-field" for="perfil-nombre">
        Nombre
        <input
          id="perfil-nombre"
          v-model="name"
          class="qa-input qa-input-lg"
          placeholder="Marta R."
          maxlength="40"
          autocomplete="nickname"
          autofocus
        />
      </label>

      <label class="qa-field" for="perfil-handle">
        Handle
        <div class="qa-prefixed">
          <span aria-hidden="true">@</span>
          <input
            id="perfil-handle"
            v-model="handle"
            class="qa-input qa-input-lg"
            placeholder="martar"
            maxlength="20"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </label>

      <p class="qa-fineprint">
        De 3 a 20 letras, números o guiones bajos. Es único y no se puede cambiar después.
      </p>

      <div v-if="error" class="qa-error">
        <i class="ph ph-warning-circle" aria-hidden="true"></i> {{ error }}
      </div>

      <button type="submit" class="qa-btn qa-btn-lg" :disabled="!valid || saving">
        {{ saving ? 'Guardando…' : 'Entrar a la arena' }}
        <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
    </form>
  </div>
</template>
