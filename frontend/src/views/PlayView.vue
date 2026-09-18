<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import QuestionOption from '../components/QuestionOption.vue'
import { useGameStore } from '../stores/game'
import { formatSeconds } from '../composables/format'

const props = defineProps<{ setId: string }>()

const router = useRouter()
const game = useGameStore()

onMounted(async () => {
  const ok = await game.start(props.setId)
  if (!ok) router.replace({ name: 'lobby' })
})

onBeforeUnmount(() => game.stopTimer())

/** Cuando el store cierra la partida, la vista salta al resumen. */
watch(
  () => game.summary,
  (summary) => {
    if (summary) router.replace({ name: 'result' })
  },
)

const verdictTitle = computed(() => {
  const result = game.result
  if (!result) return ''
  if (game.chosen === null) return 'Se acabó el tiempo'
  return result.correct ? `Correcto · +${result.points} pts` : 'Fallo · 0 pts'
})

function leave() {
  game.abandon()
  router.push({ name: 'lobby' })
}
</script>

<template>
  <div v-if="game.question" class="qa-play qa-in">
    <section>
      <div class="qa-row" style="margin-bottom: var(--space-6)">
        <button type="button" class="qa-btn qa-btn-small" @click="leave">
          <i class="ph ph-arrow-left" aria-hidden="true"></i> Salir
        </button>
        <span class="qa-label">{{ game.attempt?.setTitle }}</span>
      </div>

      <div class="qa-pips">
        <div
          v-for="(_, i) in game.questions"
          :key="i"
          class="qa-pip"
          :class="{ 'is-done': i < game.index, 'is-current': i === game.index }"
        ></div>
      </div>

      <div class="qa-note" style="margin-bottom: var(--space-3)">
        Pregunta {{ game.index + 1 }} de {{ game.total }} · {{ game.question.tag }}
      </div>

      <h2 class="qa-h2">{{ game.question.text }}</h2>

      <pre v-if="game.question.code" class="qa-code">{{ game.question.code }}</pre>

      <div class="qa-options">
        <QuestionOption
          v-for="(option, i) in game.question.options"
          :key="i"
          :index="i"
          :text="option"
          :answered="game.answered"
          :chosen="game.chosen"
          :correct-index="game.result?.correctIndex ?? null"
          @pick="game.answer"
        />
      </div>

      <div v-if="game.result" class="qa-verdict qa-in">
        <div style="max-width: 52ch">
          <div class="qa-verdict-title">{{ verdictTitle }}</div>
          <div class="qa-auth-sub">{{ game.result.why }}</div>
        </div>
        <div class="qa-spacer"></div>
        <button type="button" class="qa-btn" @click="game.next()">
          {{ game.isLast ? 'Ver resultado' : 'Siguiente pregunta' }}
          <i class="ph ph-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    </section>

    <aside class="qa-aside">
      <div class="qa-panel qa-timer">
        <div class="qa-label" style="margin-bottom: var(--space-4)">Tiempo</div>
        <div class="qa-timer-value">{{ game.secondsLeft }}s</div>
        <div class="qa-timer-track">
          <div
            class="qa-timer-bar"
            :class="{ 'is-low': game.secondsLeft <= 5 }"
            :style="{ width: `${game.timeProgress}%` }"
          ></div>
        </div>
        <div class="qa-note" style="margin-top: var(--space-4)">
          Bonus por velocidad:
          <span style="color: var(--color-accent-200)">+{{ game.liveBonus }}</span>
        </div>
      </div>

      <div class="qa-panel qa-scorecard">
        <div>
          <div class="qa-label">Puntos del set</div>
          <div class="qa-score-value">{{ game.score }}</div>
        </div>
        <div>
          <div class="qa-label">Aciertos</div>
          <div class="qa-score-value">{{ game.hits }}/{{ game.total }}</div>
        </div>
        <div>
          <div class="qa-label">Tiempo medio</div>
          <div class="qa-score-value">{{ formatSeconds(game.averageSeconds) }}</div>
        </div>
      </div>
    </aside>
  </div>

  <div v-else class="qa-empty">Preparando el set…</div>
</template>
