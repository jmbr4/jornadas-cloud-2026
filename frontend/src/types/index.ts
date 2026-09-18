/** Modelo de dominio de Quiz Arena. Lo comparten el mock y el backend real. */

export type Level = 'Fácil' | 'Media' | 'Difícil'

export interface User {
  id: string
  email: string
  name: string
  handle: string
  initials: string
  globalRank: number
  globalPoints: number
  /** Si puede entrar al panel de contenido. */
  isAdmin: boolean
  /** false mientras no haya elegido nombre y handle. */
  profileComplete: boolean
}

/** Metadatos de un set, tal y como se listan en el lobby. */
export interface QuizSet {
  id: string
  category: string
  level: Level
  title: string
  blurb: string
  questionCount: number
  secondsPerQuestion: number
  attempts: number
  status: 'Publicado' | 'Borrador'
  /** Mejor marca del usuario en este set; null si nunca lo ha jugado. */
  best: string | null
}

/**
 * Pregunta tal y como viaja al cliente: sin la respuesta correcta.
 * La corrección la resuelve el servidor en `submitAnswer`.
 */
export interface Question {
  id: string
  tag: string
  text: string
  code?: string
  options: string[]
}

/** Una partida en curso. `attemptId` es la referencia que usa el backend. */
export interface Attempt {
  attemptId: string
  setId: string
  setTitle: string
  secondsPerQuestion: number
  questions: Question[]
}

/** Veredicto del servidor para una respuesta enviada. */
export interface AnswerResult {
  correct: boolean
  correctIndex: number
  why: string
  points: number
  basePoints: number
  speedBonus: number
}

/** Resumen final de una partida. */
export interface AttemptSummary {
  attemptId: string
  setId: string
  setTitle: string
  score: number
  hits: number
  total: number
  averageSeconds: number
  setRank: number
}

export type LeaderboardScope = 'all' | string

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  handle: string
  initials: string
  points: number
  averageSeconds: number
  accuracy: number
  isMe: boolean
}

export interface Leaderboard {
  scope: LeaderboardScope
  entries: LeaderboardEntry[]
  myRank: number | null
  totalPlayers: number
}

/** Payload de alta de pregunta desde el panel de administración. */
export interface NewQuestionInput {
  setId: string
  text: string
  options: string[]
  correct: number
  level: Level
  seconds: number
  why?: string
}
