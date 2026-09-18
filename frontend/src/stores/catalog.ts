import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '../services'
import type { NewQuestionInput, QuizSet } from '../types'

export const useCatalogStore = defineStore('catalog', () => {
  const sets = ref<QuizSet[]>([])
  const loading = ref(false)
  const error = ref('')

  const totalQuestions = computed(() =>
    sets.value.reduce((total, s) => total + s.questionCount, 0),
  )

  async function load(force = false) {
    if (sets.value.length && !force) return
    loading.value = true
    error.value = ''
    try {
      sets.value = await api.listSets()
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'No se han podido cargar los sets.'
    } finally {
      loading.value = false
    }
  }

  function byId(id: string) {
    return sets.value.find((s) => s.id === id) ?? null
  }

  async function createQuestion(input: NewQuestionInput) {
    const updated = await api.createQuestion(input)
    const i = sets.value.findIndex((s) => s.id === updated.id)
    if (i >= 0) sets.value[i] = updated
    return updated
  }

  return { sets, loading, error, totalQuestions, load, byId, createQuestion }
})
