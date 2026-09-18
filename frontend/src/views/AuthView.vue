<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { config } from '../config'

const auth = useAuthStore()
const router = useRouter()

async function onSubmit() {
  await auth.sendLink()
}

/** Simula el clic en el enlace del correo. Con backend real llegará por URL. */
async function openLink() {
  if (!(await auth.verify())) return
  router.push({ name: auth.user?.profileComplete ? 'lobby' : 'profile' })
}
</script>

<template>
  <div class="qa-auth">
    <div>
      <div class="qa-brand" style="margin-bottom: var(--space-8)">
        <i class="ph-fill ph-lightning" aria-hidden="true"></i>
        <span>Quiz Arena</span>
      </div>

      <h1 class="qa-auth-title">Entra, responde, sube en la tabla.</h1>
      <p class="qa-lead">
        Sets cronometrados de programación, cloud y AWS. Sin contraseñas: te mandamos un enlace de
        acceso y ya estás compitiendo.
      </p>

      <div class="qa-auth-points">
        <div>
          <i class="ph ph-envelope-simple" aria-hidden="true"></i>
          Un enlace por correo, válido {{ config.magicLinkMinutes }} minutos
        </div>
        <div>
          <i class="ph ph-shield-check" aria-hidden="true"></i>
          Un solo uso y ligado a este dispositivo
        </div>
        <div>
          <i class="ph ph-timer" aria-hidden="true"></i>
          Puntúas por acertar y por responder rápido
        </div>
      </div>
    </div>

    <div class="qa-panel qa-panel-raised">
      <form v-if="auth.step === 'email'" class="qa-auth-form" @submit.prevent="onSubmit">
        <div>
          <div class="qa-auth-heading">Acceder</div>
          <div class="qa-auth-sub">
            Con tu correo de trabajo o personal. Si es la primera vez, se crea tu perfil.
          </div>
        </div>

        <label class="qa-field">
          Correo
          <input
            v-model="auth.email"
            type="email"
            class="qa-input qa-input-lg"
            placeholder="tu@correo.dev"
            autofocus
            autocomplete="email"
            @input="auth.error = ''"
          />
        </label>

        <div v-if="auth.error" class="qa-error">
          <i class="ph ph-warning-circle" aria-hidden="true"></i> {{ auth.error }}
        </div>

        <button type="submit" class="qa-btn qa-btn-lg" :disabled="auth.sending">
          <i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>
          {{ auth.sending ? 'Enviando…' : 'Enviar enlace de acceso' }}
        </button>

        <hr class="qa-rule" />

        <div class="qa-fineprint">
          Al continuar aceptas las normas de la liga: una cuenta por persona.
        </div>
      </form>

      <div v-else class="qa-auth-form qa-in">
        <div class="qa-auth-badge">
          <i class="ph ph-envelope-open" aria-hidden="true"></i>
        </div>

        <div>
          <div class="qa-auth-heading">Mira tu bandeja</div>
          <div class="qa-auth-sub">
            Hemos enviado un enlace a <span class="qa-strong">{{ auth.email }}</span
            >. Caduca en {{ config.magicLinkMinutes }} minutos y sirve una sola vez.
          </div>
        </div>

        <!-- Solo cuando el backend devuelve el token (modo taller, sin SES).
             Con SES en marcha el token viaja por correo y este botón no sale. -->
        <button
          v-if="auth.pendingToken"
          type="button"
          class="qa-btn qa-btn-lg"
          @click="openLink"
        >
          <i class="ph ph-arrow-square-out" aria-hidden="true"></i> Abrir el enlace (demo)
        </button>

        <div v-if="auth.error" class="qa-error">
          <i class="ph ph-warning-circle" aria-hidden="true"></i> {{ auth.error }}
        </div>

        <div class="qa-row-between">
          <button
            type="button"
            class="qa-btn-link"
            :disabled="!auth.canResend"
            @click="auth.resend()"
          >
            {{ auth.resendLabel }}
          </button>
          <button type="button" class="qa-btn-underline" @click="auth.changeEmail()">
            Usar otro correo
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
