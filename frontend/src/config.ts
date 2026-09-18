/**
 * Configuración de la app. Todo lo que cambia entre local y AWS sale de aquí.
 * Las variables viven en .env / .env.production (prefijo VITE_).
 */
export const config = {
  /** Vacío => se usa el adaptador mock en memoria. Con valor => backend HTTP. */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  /** Segundos por pregunta cuando el set no especifica otra cosa. */
  secondsPerQuestion: Number(import.meta.env.VITE_SECONDS_PER_QUESTION ?? 20),
  /** Bonus máximo por responder rápido. */
  speedBonusMax: Number(import.meta.env.VITE_SPEED_BONUS_MAX ?? 80),
  /** Puntos base por acierto. */
  basePoints: 100,
  /** Filas visibles en el leaderboard por debajo del podio. */
  leaderboardRows: 9,
  /** Minutos de validez del enlace mágico (solo texto informativo). */
  magicLinkMinutes: 15,
  /** Segundos de espera antes de poder reenviar el enlace. */
  resendSeconds: 30,
}

export const useMockApi = config.apiBaseUrl === ''
