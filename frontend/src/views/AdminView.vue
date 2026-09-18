<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useCatalogStore } from '../stores/catalog'
import { ApiError } from '../services'
import { config } from '../config'
import { formatPoints } from '../composables/format'
import type { Level } from '../types'

const catalog = useCatalogStore()

const form = reactive({
  setId: '',
  text: '',
  options: ['', '', '', ''],
  correct: 0,
  level: 'Media' as Level,
  seconds: config.secondsPerQuestion,
})

const note = ref('')
const error = ref('')
const saving = ref(false)

onMounted(() => catalog.load())

// El primer set del catálogo queda preseleccionado en cuanto carga.
watch(
  () => catalog.sets,
  (sets) => {
    if (!form.setId && sets.length) form.setId = sets[0].id
  },
  { immediate: true },
)

const summary = computed(
  () =>
    `${catalog.totalQuestions} preguntas en total · ${config.secondsPerQuestion} s por pregunta, ` +
    `bonus máximo +${config.speedBonusMax}`,
)

async function submit() {
  note.value = ''
  error.value = ''
  saving.value = true
  try {
    const updated = await catalog.createQuestion({
      setId: form.setId,
      text: form.text,
      options: form.options,
      correct: form.correct,
      level: form.level,
      seconds: Number(form.seconds),
    })
    note.value = `Publicada en “${updated.title}”.`
    form.text = ''
    form.options = ['', '', '', '']
    form.correct = 0
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No se ha podido publicar la pregunta.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="qa-in">
    <h1 class="qa-h1" style="font-size: 34px; margin-bottom: var(--space-2)">
      Panel de contenido
    </h1>
    <p class="qa-muted" style="margin: 0 0 var(--space-8); font-size: 14px">
      Sets publicados y alta de preguntas. El backend expone
      <code class="qa-code-ref">POST /sets/:id/questions</code>.
    </p>

    <div class="qa-admin">
      <div class="qa-listbox">
        <div class="qa-admin-head">
          <div>Set</div>
          <div style="text-align: right">Preguntas</div>
          <div style="text-align: right">Intentos</div>
          <div style="text-align: right">Estado</div>
        </div>

        <div v-for="set in catalog.sets" :key="set.id" class="qa-admin-row">
          <div style="min-width: 0">
            <div style="font-size: 14.5px">{{ set.title }}</div>
            <div class="qa-note">{{ set.category }} · {{ set.level }}</div>
          </div>
          <div style="text-align: right; font-family: var(--font-heading)">
            {{ set.questionCount }}
          </div>
          <div style="text-align: right; color: var(--color-neutral-300)">
            {{ formatPoints(set.attempts) }}
          </div>
          <div style="text-align: right"><span class="qa-pill">{{ set.status }}</span></div>
        </div>

        <div class="qa-admin-foot">{{ summary }}</div>
      </div>

      <form class="qa-admin-form" @submit.prevent="submit">
        <div class="qa-admin-form-title">Nueva pregunta</div>

        <label class="qa-field">
          Set
          <select v-model="form.setId" class="qa-select">
            <option v-for="set in catalog.sets" :key="set.id" :value="set.id">
              {{ set.title }}
            </option>
          </select>
        </label>

        <label class="qa-field">
          Enunciado
          <textarea
            v-model="form.text"
            rows="3"
            class="qa-textarea"
            placeholder="¿Qué servicio…?"
          ></textarea>
        </label>

        <div class="qa-stack" style="gap: var(--space-3)">
          <div style="font-size: 12px; color: var(--color-neutral-400)">
            Opciones — marca la correcta
          </div>
          <label v-for="(_, i) in form.options" :key="i" class="qa-option-row">
            <input v-model="form.correct" type="radio" name="correcta" :value="i" class="qa-radio" />
            <input
              v-model="form.options[i]"
              type="text"
              class="qa-input"
              :placeholder="`Opción ${'ABCD'[i]}`"
            />
          </label>
        </div>

        <div class="qa-row" style="gap: var(--space-6); align-items: flex-start">
          <label class="qa-field" style="flex: 1">
            Dificultad
            <select v-model="form.level" class="qa-select">
              <option value="Fácil">Fácil</option>
              <option value="Media">Media</option>
              <option value="Difícil">Difícil</option>
            </select>
          </label>
          <label class="qa-field" style="width: 110px">
            Segundos
            <input v-model.number="form.seconds" type="number" min="5" max="120" class="qa-input" />
          </label>
        </div>

        <div class="qa-row" style="gap: var(--space-6)">
          <button type="submit" class="qa-btn" :disabled="saving">
            <i class="ph ph-plus" aria-hidden="true"></i>
            {{ saving ? 'Publicando…' : 'Publicar pregunta' }}
          </button>
          <span v-if="note" style="font-size: 12.5px; color: var(--color-accent-300)">
            {{ note }}
          </span>
          <span v-if="error" class="qa-error">{{ error }}</span>
        </div>
      </form>
    </div>
  </div>
</template>
