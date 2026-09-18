/**
 * Reglas de puntuación. Funciones puras, sin dependencias: viven en el
 * servidor a propósito, porque el cliente no debe poder calcular ni falsear
 * sus propios puntos.
 */

export const BASE_POINTS = 100

export interface ScoreInput {
  correct: boolean
  /** Segundos que tardó en responder. */
  elapsedSeconds: number
  secondsPerQuestion: number
  speedBonusMax: number
}

export interface ScoreBreakdown {
  basePoints: number
  speedBonus: number
  points: number
}

/**
 * Acertar da `BASE_POINTS` más un bonus proporcional al tiempo que sobra.
 * Fallar o agotar el tiempo da 0: el bonus nunca se concede sin acierto.
 */
export function scoreAnswer({
  correct,
  elapsedSeconds,
  secondsPerQuestion,
  speedBonusMax,
}: ScoreInput): ScoreBreakdown {
  if (!correct) return { basePoints: 0, speedBonus: 0, points: 0 }

  const spent = clamp(elapsedSeconds, 0, secondsPerQuestion)
  const remaining = secondsPerQuestion > 0 ? (secondsPerQuestion - spent) / secondsPerQuestion : 0
  const speedBonus = Math.round(remaining * speedBonusMax)

  return { basePoints: BASE_POINTS, speedBonus, points: BASE_POINTS + speedBonus }
}

/** Media de segundos de las respuestas dadas (las no contestadas cuentan). */
export function averageSeconds(seconds: number[]): number {
  if (seconds.length === 0) return 0
  return seconds.reduce((total, value) => total + value, 0) / seconds.length
}

export function accuracy(hits: number, total: number): number {
  return total > 0 ? Math.round((hits / total) * 100) : 0
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)
