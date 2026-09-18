<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  index: number
  text: string
  answered: boolean
  chosen: number | null
  correctIndex: number | null
}>()

defineEmits<{ pick: [index: number] }>()

const letter = computed(() => 'ABCDEFGH'[props.index] ?? '?')

const state = computed(() => {
  if (!props.answered) return ''
  if (props.index === props.correctIndex) return 'is-correct'
  if (props.index === props.chosen) return 'is-wrong'
  return 'is-dim'
})

const icon = computed(() => {
  if (!props.answered) return null
  if (props.index === props.correctIndex) return 'ph-fill ph-check-circle'
  if (props.index === props.chosen) return 'ph ph-x-circle'
  return null
})
</script>

<template>
  <button
    type="button"
    class="qa-option"
    :class="state"
    :disabled="answered"
    @click="$emit('pick', index)"
  >
    <span class="qa-option-badge">{{ letter }}</span>
    <span class="qa-option-text">{{ text }}</span>
    <i v-if="icon" :class="[icon, 'qa-option-icon']" aria-hidden="true"></i>
  </button>
</template>
