<script setup lang="ts">
import type { QuizSet } from '../types'

defineProps<{ set: QuizSet }>()
defineEmits<{ start: [setId: string] }>()
</script>

<template>
  <article class="qa-set-card">
    <div class="qa-row-between">
      <span class="qa-label">{{ set.category }}</span>
      <span class="qa-pill">{{ set.level }}</span>
    </div>

    <h3 class="qa-set-title">{{ set.title }}</h3>
    <p class="qa-set-blurb">{{ set.blurb }}</p>

    <hr class="qa-rule" />

    <div class="qa-set-meta">
      <span><i class="ph ph-list-numbers" aria-hidden="true"></i>{{ set.questionCount }} preguntas</span>
      <span><i class="ph ph-timer" aria-hidden="true"></i>{{ set.secondsPerQuestion }} s / pregunta</span>
    </div>

    <div class="qa-row-between" style="margin-top: var(--space-2)">
      <div class="qa-note">
        Tu mejor: <span class="qa-strong">{{ set.best ?? 'Sin intentos' }}</span>
      </div>
      <button type="button" class="qa-btn" @click="$emit('start', set.id)">
        Empezar <i class="ph ph-arrow-right" aria-hidden="true"></i>
      </button>
    </div>
  </article>
</template>
