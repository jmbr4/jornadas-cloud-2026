import { config } from '../../config'
import type {
  Attempt,
  AnswerResult,
  AttemptSummary,
  Leaderboard,
  LeaderboardScope,
  NewQuestionInput,
  QuizSet,
  User,
} from '../../types'
import { ApiError, type QuizArenaApi } from '../api'

const TOKEN_KEY = 'quiz-arena.token'

/**
 * Cliente del backend real. Se activa en cuanto VITE_API_BASE_URL tiene valor.
 * Las rutas son las que expondrá API Gateway; ajústalas al desplegar.
 */
export class HttpApi implements QuizArenaApi {
  private readonly baseUrl: string

  constructor(baseUrl = config.apiBaseUrl) {
    this.baseUrl = baseUrl
  }

  private get token() {
    return localStorage.getItem(TOKEN_KEY)
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body) headers.set('Content-Type', 'application/json')
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    } catch {
      throw new ApiError('No se ha podido contactar con el servidor.', 0)
    }

    if (response.status === 204) return undefined as T
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        (payload as { message?: string } | null)?.message ?? `Error ${response.status}`
      throw new ApiError(message, response.status)
    }
    return payload as T
  }

  // --- Autenticación ---

  requestMagicLink(email: string) {
    return this.request<{ sentTo: string; expiresInMinutes: number }>('/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  async verifyMagicLink(token: string) {
    const session = await this.request<{ user: User; sessionToken: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    localStorage.setItem(TOKEN_KEY, session.sessionToken)
    return session
  }

  async me() {
    if (!this.token) return null
    try {
      return await this.request<User>('/me')
    } catch (error) {
      // 401: la sesión no vale. 404: vale, pero apunta a un perfil que ya no
      // está. Para el cliente son lo mismo — no hay sesión — y en ambos casos
      // el token guardado sobra.
      if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
        localStorage.removeItem(TOKEN_KEY)
        return null
      }
      throw error
    }
  }

  createProfile(name: string, handle: string) {
    return this.request<User>('/me/profile', {
      method: 'POST',
      body: JSON.stringify({ name, handle }),
    })
  }

  async logout() {
    localStorage.removeItem(TOKEN_KEY)
  }

  // --- Catálogo ---

  listSets() {
    return this.request<QuizSet[]>('/sets')
  }

  // --- Partida ---

  startAttempt(setId: string) {
    return this.request<Attempt>(`/sets/${encodeURIComponent(setId)}/attempts`, { method: 'POST' })
  }

  async openQuestion(attemptId: string, questionId: string) {
    await this.request(
      `/attempts/${encodeURIComponent(attemptId)}/questions/${encodeURIComponent(questionId)}/open`,
      { method: 'POST' },
    )
  }

  submitAnswer(attemptId: string, questionId: string, choice: number | null) {
    return this.request<AnswerResult>(
      `/attempts/${encodeURIComponent(attemptId)}/answers`,
      { method: 'POST', body: JSON.stringify({ questionId, choice }) },
    )
  }

  finishAttempt(attemptId: string) {
    return this.request<AttemptSummary>(`/attempts/${encodeURIComponent(attemptId)}/finish`, {
      method: 'POST',
    })
  }

  // --- Leaderboard ---

  getLeaderboard(scope: LeaderboardScope) {
    return this.request<Leaderboard>(`/leaderboard?scope=${encodeURIComponent(scope)}`)
  }

  // --- Administración ---

  createQuestion(input: NewQuestionInput) {
    const { setId, ...body } = input
    return this.request<QuizSet>(`/sets/${encodeURIComponent(setId)}/questions`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }
}
