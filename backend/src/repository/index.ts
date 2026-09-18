import type {
  AttemptAnswerRecord,
  AttemptRecord,
  MagicLinkRecord,
  QuestionRecord,
  ScoreRecord,
  SetRecord,
  UserRecord,
} from '../domain/types.js'

/**
 * PUERTO DE PERSISTENCIA.
 *
 * Las Lambdas solo hablan con esta interfaz; no saben si detrás hay DynamoDB,
 * memoria o cualquier otra cosa. Cuando diseñemos el modelo de datos, se
 * implementa esta interfaz en `db/` y no se toca ni un handler.
 *
 * Cada método de aquí es un PATRÓN DE ACCESO. La lista completa es justo lo
 * que hay que tener delante para diseñar la tabla: en DynamoDB el modelo se
 * deriva de las consultas, no al revés.
 *
 *   findUserByEmail   -> buscar por email, que no es la clave natural (¿GSI?)
 *   getUsers          -> varias fichas de golpe, no una por viaje
 *   saveProfile       -> reservar un handle sin que dos personas ganen a la vez
 *   listQuestions     -> todas las preguntas de un set (colección bajo una PK)
 *   getAttempt        -> un intento por id (acceso directo por clave)
 *   appendAnswer      -> añadir una respuesta a un intento sin pisar las otras
 *   listScores        -> marcas de un set, o de todos, ordenables por puntos
 *                        (el patrón difícil: ordenar por puntuación)
 */
export interface QuizRepository {
  // --- Usuarios ---
  getUser(userId: string): Promise<UserRecord | null>
  /**
   * Varios perfiles de una vez. Los que no existan simplemente no vienen.
   *
   * Existe para no hacer un viaje por jugador al pintar el leaderboard: con
   * cientos de filas, la diferencia entre esto y un bucle de `getUser` es la
   * diferencia entre una llamada y cientos.
   */
  getUsers(userIds: string[]): Promise<UserRecord[]>
  findUserByEmail(email: string): Promise<UserRecord | null>
  createUser(user: UserRecord): Promise<UserRecord>
  /** null si el handle está libre. */
  findUserByHandle(handle: string): Promise<UserRecord | null>
  /**
   * Fija nombre y handle. Falla si el handle ya es de otra persona.
   * Devuelve null en ese caso: es una colisión esperable, no un error.
   */
  saveProfile(userId: string, name: string, handle: string): Promise<UserRecord | null>

  // --- Enlaces mágicos ---
  saveMagicLink(link: MagicLinkRecord): Promise<void>
  /** Marca el enlace como usado y lo devuelve. null si no existe, caducó o ya se usó. */
  consumeMagicLink(token: string): Promise<MagicLinkRecord | null>

  // --- Catálogo ---
  listSets(): Promise<SetRecord[]>
  getSet(setId: string): Promise<SetRecord | null>
  /** Suma 1 al contador de intentos del set. */
  incrementSetAttempts(setId: string): Promise<void>

  // --- Preguntas (incluyen la respuesta correcta: nunca salen sin filtrar) ---
  listQuestions(setId: string): Promise<QuestionRecord[]>
  getQuestion(setId: string, questionId: string): Promise<QuestionRecord | null>
  addQuestion(question: QuestionRecord): Promise<QuestionRecord>

  // --- Intentos ---
  createAttempt(attempt: AttemptRecord): Promise<AttemptRecord>
  getAttempt(attemptId: string): Promise<AttemptRecord | null>
  /** Marca el instante en que se abre una pregunta. Devuelve el intento. */
  openQuestion(attemptId: string, at: string): Promise<AttemptRecord>
  /** Añade una respuesta y actualiza los acumulados del intento. */
  appendAnswer(attemptId: string, answer: AttemptAnswerRecord): Promise<AttemptRecord>
  /** Cierra el intento y fija su marca de tiempo final. */
  finishAttempt(attemptId: string): Promise<AttemptRecord>

  // --- Marcas / leaderboard ---
  /** `setId` undefined = todas. */
  listScores(setId?: string): Promise<ScoreRecord[]>
  getScore(userId: string, setId: string): Promise<ScoreRecord | null>
  /** Guarda la marca solo si mejora la anterior. */
  saveBestScore(score: ScoreRecord): Promise<void>
}

/** Error de persistencia: nunca debe llegar tal cual al cliente. */
export class RepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RepositoryError'
  }
}
