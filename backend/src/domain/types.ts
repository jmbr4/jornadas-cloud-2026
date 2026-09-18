/**
 * Modelo de dominio del backend.
 *
 * Dos familias de tipos, y la diferencia importa:
 *
 *  - `*Record`: lo que se guarda en la base de datos. Incluye datos que NUNCA
 *    salen hacia el navegador (sobre todo `correct`, la respuesta buena).
 *  - Tipos "wire": lo que devuelve la API. Reflejan `frontend/src/types`.
 *
 * Los mappers del final de este fichero son la frontera entre ambos.
 */

export type Level = 'Fácil' | 'Media' | 'Difícil'

// ---------------------------------------------------------------------------
// Registros persistidos
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  /** El correo NUNCA sale hacia otros usuarios. Ver `toPublicUser`. */
  email: string
  /**
   * Nombre y handle los elige la persona al entrar por primera vez.
   *
   * Son opcionales porque entre canjear el enlace y completar el perfil hay
   * un momento en que la cuenta existe sin ellos. No se derivan del correo:
   * hacerlo publicaría en el leaderboard quién es cada uno.
   */
  name?: string
  handle?: string
  createdAt: string
}

/** Enlace mágico emitido y pendiente de canjear. */
export interface MagicLinkRecord {
  token: string
  email: string
  expiresAt: string
  consumedAt?: string
}

export interface SetRecord {
  id: string
  /**
   * Orden en el que se muestran los sets.
   *
   * DynamoDB devuelve lo que hay en una partición ordenado por sort key, que
   * aquí es el id. Si el orden de presentación importa, hay que guardarlo:
   * no puede depender de cómo se llame el set ni de en qué orden se insertó.
   */
  order: number
  category: string
  level: Level
  title: string
  blurb: string
  secondsPerQuestion: number
  status: 'Publicado' | 'Borrador'
  /** Contador acumulado de partidas jugadas. */
  attempts: number
}

/** La pregunta completa. `correct` y `why` no salen de aquí hasta responder. */
export interface QuestionRecord {
  id: string
  setId: string
  tag: string
  text: string
  code?: string
  options: string[]
  correct: number
  why: string
  createdAt: string
}

export interface AttemptAnswerRecord {
  questionId: string
  choice: number | null
  correct: boolean
  points: number
  elapsedSeconds: number
  answeredAt: string
}

export interface AttemptRecord {
  id: string
  userId: string
  setId: string
  /** Orden de preguntas fijado al empezar: el intento no cambia a mitad. */
  questionIds: string[]
  secondsPerQuestion: number
  answers: AttemptAnswerRecord[]
  startedAt: string
  /**
   * Cuándo se puso la pregunta actual delante del jugador, según el reloj del
   * servidor. Es la referencia con la que se mide lo que tardó: el cronómetro
   * del navegador sirve para pintar la cuenta atrás, no para puntuar.
   */
  questionStartedAt: string
  finishedAt?: string
  score: number
  hits: number
}

/** Mejor marca de un usuario en un set: lo que alimenta el leaderboard. */
export interface ScoreRecord {
  userId: string
  setId: string
  points: number
  averageSeconds: number
  accuracy: number
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Tipos de salida (deben cuadrar con frontend/src/types/index.ts)
// ---------------------------------------------------------------------------

export interface User {
  id: string
  /** Solo se devuelve en `/me` y `/auth/verify`: es tu propio correo. */
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
  best: string | null
}

/** Pregunta sin respuesta correcta: es lo único que ve el navegador. */
export interface Question {
  id: string
  tag: string
  text: string
  code?: string
  options: string[]
}

export interface Attempt {
  attemptId: string
  setId: string
  setTitle: string
  secondsPerQuestion: number
  questions: Question[]
}

export interface AnswerResult {
  correct: boolean
  correctIndex: number
  why: string
  points: number
  basePoints: number
  speedBonus: number
}

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
  scope: string
  entries: LeaderboardEntry[]
  myRank: number | null
  totalPlayers: number
}

// ---------------------------------------------------------------------------
// Mappers — la frontera entre lo persistido y lo publicado
// ---------------------------------------------------------------------------

export const initialsOf = (name: string): string =>
  name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Quita `correct` y `why`. Todo lo que va al cliente pasa por aquí. */
export const toPublicQuestion = (record: QuestionRecord): Question => ({
  id: record.id,
  tag: record.tag,
  text: record.text,
  ...(record.code ? { code: record.code } : {}),
  options: record.options,
})

export const toPublicUser = (
  record: UserRecord,
  globalRank: number,
  globalPoints: number,
  isAdmin: boolean,
): User => ({
  id: record.id,
  email: record.email,
  name: record.name ?? '',
  handle: record.handle ?? '',
  initials: initialsOf(record.name ?? ''),
  globalRank,
  globalPoints,
  isAdmin,
  profileComplete: Boolean(record.name && record.handle),
})

/**
 * Cómo se llama alguien de cara a los demás.
 *
 * Nunca cae de vuelta al correo: si aún no ha elegido nombre, aparece como
 * anónimo. Es la diferencia entre no saber cómo llamarle y filtrar su
 * dirección en una tabla pública.
 */
export const publicName = (record: UserRecord) => record.name ?? 'Sin nombre'
export const publicHandle = (record: UserRecord) => record.handle ?? ''
