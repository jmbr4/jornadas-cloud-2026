import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '../services'
import { config } from '../config'
import type { Attempt, AnswerResult, AttemptSummary, Question } from '../types'

/**
 * Estado de una partida: pregunta actual, cronómetro y marcador.
 * El cronómetro vive aquí para que sobreviva a los re-render de la vista.
 */
export const useGameStore = defineStore('game', () => {
  const attempt = ref<Attempt | null>(null)
  const index = ref(0)
  const chosen = ref<number | null>(null)
  const result = ref<AnswerResult | null>(null)
  const secondsLeft = ref(0)
  const score = ref(0)
  const hits = ref(0)
  const times = ref<number[]>([])
  const summary = ref<AttemptSummary | null>(null)
  const loading = ref(false)
  const error = ref('')

  let ticker: ReturnType<typeof setInterval> | null = null

  const questions = computed<Question[]>(() => attempt.value?.questions ?? [])
  const total = computed(() => questions.value.length)
  const question = computed<Question | null>(() => questions.value[index.value] ?? null)
  const seconds = computed(() => attempt.value?.secondsPerQuestion ?? config.secondsPerQuestion)
  const answered = computed(() => result.value !== null)
  const isLast = computed(() => index.value + 1 >= total.value)
  const elapsed = computed(() => seconds.value - secondsLeft.value)

  const averageSeconds = computed(() =>
    times.value.length ? times.value.reduce((a, b) => a + b, 0) / times.value.length : 0,
  )
  /** Bonus que se llevaría ahora mismo si acierta. */
  const liveBonus = computed(() =>
    answered.value ? 0 : Math.round((secondsLeft.value / seconds.value) * config.speedBonusMax),
  )
  const timeProgress = computed(() =>
    Math.max(0, (secondsLeft.value / seconds.value) * 100),
  )

  function stopTimer() {
    if (ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  /**
   * Avisa al servidor de que esta pregunta ya está en pantalla. Él sella la
   * hora y con eso calcula el bonus por velocidad; la cuenta atrás de aquí es
   * solo para que el jugador la vea.
   */
  async function openCurrentQuestion() {
    if (!attempt.value || !question.value) return
    try {
      await api.openQuestion(attempt.value.attemptId, question.value.id)
    } catch {
      // Que falle no debe cortar la partida: el servidor seguirá teniendo la
      // marca anterior y, como mucho, contará algo más de tiempo.
    }
  }

  function startTimer() {
    stopTimer()
    secondsLeft.value = seconds.value
    ticker = setInterval(() => {
      if (answered.value) return
      if (secondsLeft.value <= 1) {
        secondsLeft.value = 0
        stopTimer()
        void answer(null)
        return
      }
      secondsLeft.value -= 1
    }, 1000)
  }

  async function start(setId: string) {
    loading.value = true
    error.value = ''
    try {
      attempt.value = await api.startAttempt(setId)
      index.value = 0
      chosen.value = null
      result.value = null
      score.value = 0
      hits.value = 0
      times.value = []
      summary.value = null
      startTimer()
      void openCurrentQuestion()
      return true
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se ha podido empezar el set.'
      return false
    } finally {
      loading.value = false
    }
  }

  /** `choice` null = se acabó el tiempo. */
  async function answer(choice: number | null) {
    if (!attempt.value || !question.value || answered.value) return
    stopTimer()
    chosen.value = choice
    const spent = elapsed.value

    try {
      const verdict = await api.submitAnswer(
        attempt.value.attemptId,
        question.value.id,
        choice,
      )
      result.value = verdict
      score.value += verdict.points
      if (verdict.correct) hits.value += 1
      times.value = [...times.value, spent]
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se ha podido enviar la respuesta.'
      startTimer()
    }
  }

  /** Avanza; devuelve false cuando la partida ha terminado. */
  async function next() {
    if (!attempt.value) return false
    if (isLast.value) {
      await finish()
      return false
    }
    index.value += 1
    chosen.value = null
    result.value = null
    startTimer()
    await openCurrentQuestion()
    return true
  }

  async function finish() {
    if (!attempt.value) return
    stopTimer()
    try {
      summary.value = await api.finishAttempt(attempt.value.attemptId)
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se ha podido cerrar la partida.'
    }
  }

  /** Abandonar el set sin terminarlo. */
  function abandon() {
    stopTimer()
    attempt.value = null
    result.value = null
    chosen.value = null
  }

  return {
    attempt,
    index,
    chosen,
    result,
    secondsLeft,
    score,
    hits,
    times,
    summary,
    loading,
    error,
    questions,
    total,
    question,
    seconds,
    answered,
    isLast,
    averageSeconds,
    liveBonus,
    timeProgress,
    start,
    answer,
    next,
    finish,
    abandon,
    stopTimer,
  }
})
