import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '../services'
import { config } from '../config'
import type { User } from '../types'

export type AuthStep = 'email' | 'sent'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const step = ref<AuthStep>('email')
  const email = ref('')
  const error = ref('')
  const sending = ref(false)
  const resendIn = ref(0)
  const ready = ref(false)
  /** Token del enlace, cuando el backend lo devuelve en modo taller. */
  const pendingToken = ref('')

  let ticker: ReturnType<typeof setInterval> | null = null

  const isAuthenticated = computed(() => user.value !== null)
  const canResend = computed(() => resendIn.value === 0)
  const resendLabel = computed(() =>
    resendIn.value > 0
      ? `Reenviar en 0:${String(resendIn.value).padStart(2, '0')}`
      : 'Reenviar el enlace',
  )

  function startCountdown() {
    resendIn.value = config.resendSeconds
    if (ticker) clearInterval(ticker)
    ticker = setInterval(() => {
      resendIn.value -= 1
      if (resendIn.value <= 0 && ticker) {
        clearInterval(ticker)
        ticker = null
      }
    }, 1000)
  }

  /**
   * Restaura la sesión al arrancar la app.
   *
   * No lanza nunca: la llama el guard del router antes de la primera
   * navegación, así que un fallo aquí dejaría la página en blanco. Si no se
   * puede determinar quién es, se entra como anónimo y la pantalla de acceso
   * hace el resto.
   */
  async function restore() {
    if (ready.value) return
    try {
      user.value = await api.me()
    } catch (e) {
      user.value = null
      error.value = e instanceof ApiError ? e.message : 'No se ha podido contactar con el servidor.'
    } finally {
      ready.value = true
    }
  }

  async function sendLink() {
    error.value = ''
    sending.value = true
    try {
      const sent = await api.requestMagicLink(email.value)
      pendingToken.value = sent.demoToken ?? ''
      step.value = 'sent'
      startCountdown()
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se ha podido enviar el enlace.'
    } finally {
      sending.value = false
    }
  }

  async function resend() {
    if (!canResend.value) return
    await sendLink()
  }

  /**
   * Canjea el enlace. El token sale de la respuesta de `sendLink`; con SES de
   * verdad llegaría en la URL del correo y se pasaría explícitamente.
   */
  async function verify(token = pendingToken.value) {
    error.value = ''
    try {
      const session = await api.verifyMagicLink(token)
      user.value = session.user
      pendingToken.value = ''
      return true
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'El enlace no es válido.'
      return false
    }
  }

  function changeEmail() {
    step.value = 'email'
    error.value = ''
    pendingToken.value = ''
    resendIn.value = 0
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  async function logout() {
    await api.logout()
    user.value = null
    changeEmail()
    email.value = ''
  }

  return {
    user,
    step,
    email,
    error,
    sending,
    resendIn,
    ready,
    pendingToken,
    isAuthenticated,
    canResend,
    resendLabel,
    restore,
    sendLink,
    resend,
    verify,
    changeEmail,
    logout,
  }
})
