<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardEntry } from '../types'
import { formatPoints, formatSeconds } from '../composables/format'

const props = defineProps<{ entry: LeaderboardEntry }>()

const isFirst = computed(() => props.entry.rank === 1)
/** Alturas del bloque por puesto, como en el diseño. */
const blockHeight = computed(() => ({ 1: 150, 2: 104, 3: 74 })[props.entry.rank] ?? 74)
</script>

<template>
  <div class="qa-podium-col" :class="{ 'is-first': isFirst }">
    <div class="qa-podium-info">
      <i
        :class="[isFirst ? 'ph-fill ph-trophy' : 'ph ph-medal', 'qa-podium-icon']"
        aria-hidden="true"
      ></i>
      <div class="qa-avatar qa-podium-avatar">{{ entry.initials }}</div>
      <div class="qa-podium-name">{{ entry.name }}</div>
      <div class="qa-note">{{ entry.handle }}</div>
      <div class="qa-podium-points">
        <span>{{ formatPoints(entry.points) }}</span>
        <span>pts</span>
      </div>
      <div style="font-size: 12px; color: var(--color-neutral-400)">
        {{ formatSeconds(entry.averageSeconds) }} de media
      </div>
    </div>

    <div class="qa-podium-block" :style="{ height: `${blockHeight}px` }">
      <span class="qa-podium-numeral">{{ entry.rank }}</span>
    </div>
  </div>
</template>
