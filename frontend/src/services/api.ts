import type {
  Attempt,
  AttemptSummary,
  AnswerResult,
  Leaderboard,
  LeaderboardScope,
  NewQuestionInput,
  QuizSet,
  User,
} from '../types'

/**
 * Contrato único entre la UI y el origen de datos.
 *
 * Hoy lo implementa `MockApi` (en memoria). Cuando exista el backend en AWS,
 * basta con implementar `HttpApi` contra API Gateway: ningún componente ni
 * store cambia, solo la variable VITE_API_BASE_URL.
 */
export interface QuizArenaApi {
  // --- Autenticación (enlace mágico, sin contraseña) ---
  /**
   * `demoToken` solo llega si el backend corre en modo taller
   * (RETURN_MAGIC_LINK_TOKEN=true, mientras SES esté en sandbox). En
   * producción el token viaja por correo y nunca por esta respuesta.
   */
  requestMagicLink(
    email: string,
  ): Promise<{ sentTo: string; expiresInMinutes: number; demoToken?: string }>
  /** Canjea el token del enlace por una sesión. */
  verifyMagicLink(token: string): Promise<{ user: User; sessionToken: string }>
  /** Recupera la sesión guardada al recargar la página. */
  me(): Promise<User | null>
  /**
   * Fija el nombre visible y el handle la primera vez.
   *
   * Nada público se deriva del correo: si el handle saliera de la dirección,
   * el leaderboard estaría publicando quién es cada persona.
   */
  createProfile(name: string, handle: string): Promise<User>
  logout(): Promise<void>

  // --- Catálogo ---
  listSets(): Promise<QuizSet[]>

  // --- Partida ---
  startAttempt(setId: string): Promise<Attempt>
  /**
   * Avisa de que la pregunta acaba de aparecer en pantalla. El servidor sella
   * la hora con su reloj y es esa marca la que decide el bonus por velocidad,
   * no el cronómetro del navegador.
   */
  openQuestion(attemptId: string, questionId: string): Promise<void>
  /**
   * Envía la opción elegida y recibe el veredicto. `choice` es null si se
   * agotó el tiempo. La corrección, el tiempo y los puntos son del servidor.
   */
  submitAnswer(
    attemptId: string,
    questionId: string,
    choice: number | null,
  ): Promise<AnswerResult>
  finishAttempt(attemptId: string): Promise<AttemptSummary>

  // --- Leaderboard ---
  getLeaderboard(scope: LeaderboardScope): Promise<Leaderboard>

  // --- Administración ---
  createQuestion(input: NewQuestionInput): Promise<QuizSet>
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
