import { config } from '../../config'
import type {
  Attempt,
  AnswerResult,
  AttemptSummary,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardScope,
  NewQuestionInput,
  Question,
  QuizSet,
  User,
} from '../../types'
import { ApiError, type QuizArenaApi } from '../api'
import { SEED_PLAYERS, SEED_SETS, type SeedQuestion, type SeedSet } from './seed'

const SESSION_KEY = 'quiz-arena.session'
const LATENCY_MS = 180

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

interface StoredSession {
  sessionToken: string
  user: User
}

interface LiveAttempt {
  attemptId: string
  setId: string
  set: SeedSet
  openedAt: number
  answers: { questionId: string; correct: boolean; points: number; seconds: number }[]
}

/**
 * Backend simulado en memoria. Reproduce la semántica que tendrá el real:
 * las preguntas viajan sin la respuesta, y la corrección ocurre aquí.
 */
export class MockApi implements QuizArenaApi {
  private sets: SeedSet[] = SEED_SETS.map((s) => ({ ...s, questions: [...s.questions] }))
  private attempts = new Map<string, LiveAttempt>()
  /** Mejores marcas del usuario por set, acumuladas durante la sesión. */
  private myBest = new Map<string, { points: number; avg: number; accuracy: number }>()
  private pendingEmail: string | null = null

  constructor() {
    // El jugador marcado como `isMe` en el seed aporta el histórico de partida,
    // para que una partida peor no borre una marca anterior mejor.
    const me = SEED_PLAYERS.find((p) => p.isMe)
    if (!me) return
    this.sets.forEach((set, i) => {
      if ((me.points[i] ?? 0) > 0) {
        this.myBest.set(set.id, {
          points: me.points[i],
          avg: me.avg[i] ?? 0,
          accuracy: me.acc[i] ?? 0,
        })
      }
    })
  }

  // --- Autenticación ---

  async requestMagicLink(email: string) {
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      throw new ApiError('Escribe un correo válido para recibir el enlace.', 400)
    }
    this.pendingEmail = clean
    // El mock usa el propio correo como token: el botón "Abrir el enlace
    // (demo)" hace de clic en el correo.
    return delay({
      sentTo: clean,
      expiresInMinutes: config.magicLinkMinutes,
      demoToken: clean,
    })
  }

  async createProfile(name: string, handle: string): Promise<User> {
    const session = this.storedSession()
    if (!session) throw new ApiError('No hay sesión.', 401)

    const clean = handle.trim().replace(/^@+/, '').toLowerCase()
    if (SEED_PLAYERS.some((player) => player.handle.slice(1) === clean)) {
      throw new ApiError('Ese handle ya está cogido. Prueba con otro.', 409)
    }

    session.user = {
      ...session.user,
      name: name.trim(),
      handle: `@${clean}`,
      initials: initialsOf(name),
      profileComplete: true,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return delay(session.user)
  }

  private storedSession(): StoredSession | null {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredSession
    } catch {
      return null
    }
  }

  async verifyMagicLink(token: string) {
    // En el mock el "token" es el propio correo pendiente: el botón
    // "Abrir el enlace (demo)" simula el clic en el correo.
    const email = token || this.pendingEmail
    if (!email) throw new ApiError('El enlace ha caducado o ya se ha usado.', 401)

    // Igual que el backend: la cuenta nace sin nombre ni handle, y el
    // siguiente paso es elegirlos.
    const user: User = {
      id: `u-${email}`,
      email,
      name: '',
      handle: '',
      initials: '',
      globalRank: 7,
      globalPoints: 4210,
      // Sin backend no hay a quién preguntar: en el mock todo el mundo es
      // administrador, para poder ver el panel.
      isAdmin: true,
      profileComplete: false,
    }
    const session: StoredSession = { sessionToken: `mock-${Date.now()}`, user }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    this.pendingEmail = null
    return delay(session)
  }

  async me() {
    return this.storedSession()?.user ?? null
  }

  async logout() {
    localStorage.removeItem(SESSION_KEY)
    this.attempts.clear()
  }

  // --- Catálogo ---

  async listSets(): Promise<QuizSet[]> {
    return delay(this.sets.map((s) => this.toPublicSet(s)))
  }

  private toPublicSet(s: SeedSet): QuizSet {
    const mine = this.myBest.get(s.id)
    return {
      id: s.id,
      category: s.category,
      level: s.level,
      title: s.title,
      blurb: s.blurb,
      questionCount: s.questions.length,
      secondsPerQuestion: config.secondsPerQuestion,
      attempts: s.attempts,
      status: 'Publicado',
      best: mine ? `${mine.points} pts · #${this.rankForPoints(s.id, mine.points)}` : s.best,
    }
  }

  // --- Partida ---

  async startAttempt(setId: string): Promise<Attempt> {
    const set = this.sets.find((s) => s.id === setId)
    if (!set) throw new ApiError('Ese set no existe.', 404)

    const attemptId = `att-${setId}-${Date.now()}`
    this.attempts.set(attemptId, { attemptId, setId, set, openedAt: Date.now(), answers: [] })

    return delay({
      attemptId,
      setId,
      setTitle: set.title,
      secondsPerQuestion: config.secondsPerQuestion,
      questions: set.questions.map(stripAnswer),
    })
  }

  /** En el mock el cronómetro es el del navegador: no hay servidor que medir. */
  async openQuestion(attemptId: string, _questionId: string): Promise<void> {
    const attempt = this.attempts.get(attemptId)
    if (attempt) attempt.openedAt = Date.now()
  }

  async submitAnswer(
    attemptId: string,
    questionId: string,
    choice: number | null,
  ): Promise<AnswerResult> {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new ApiError('La partida ya no está activa.', 404)

    const question = attempt.set.questions.find((q) => q.id === questionId)
    if (!question) throw new ApiError('Pregunta desconocida.', 404)
    if (attempt.answers.some((a) => a.questionId === questionId)) {
      throw new ApiError('Esa pregunta ya estaba respondida.', 409)
    }

    const secs = config.secondsPerQuestion
    const spent = Math.min(Math.max((Date.now() - attempt.openedAt) / 1000, 0), secs)
    const correct = choice !== null && choice === question.correct
    const speedBonus = correct ? Math.round(((secs - spent) / secs) * config.speedBonusMax) : 0
    const points = correct ? config.basePoints + speedBonus : 0

    attempt.answers.push({ questionId, correct, points, seconds: spent })

    return delay({
      correct,
      correctIndex: question.correct,
      why: question.why,
      points,
      basePoints: correct ? config.basePoints : 0,
      speedBonus,
    })
  }

  async finishAttempt(attemptId: string): Promise<AttemptSummary> {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new ApiError('La partida ya no está activa.', 404)

    const total = attempt.set.questions.length
    const score = attempt.answers.reduce((a, b) => a + b.points, 0)
    const hits = attempt.answers.filter((a) => a.correct).length
    const seconds = attempt.answers.map((a) => a.seconds)
    const averageSeconds = seconds.length
      ? seconds.reduce((a, b) => a + b, 0) / seconds.length
      : 0

    const previous = this.myBest.get(attempt.setId)
    if (!previous || score > previous.points) {
      this.myBest.set(attempt.setId, {
        points: score,
        avg: averageSeconds,
        accuracy: total ? Math.round((hits / total) * 100) : 0,
      })
    }

    this.attempts.delete(attemptId)

    return delay({
      attemptId,
      setId: attempt.setId,
      setTitle: attempt.set.title,
      score,
      hits,
      total,
      averageSeconds,
      setRank: this.rankForPoints(attempt.setId, score),
    })
  }

  // --- Leaderboard ---

  async getLeaderboard(scope: LeaderboardScope): Promise<Leaderboard> {
    const user = await this.me()
    const setIndex = scope === 'all' ? -1 : this.sets.findIndex((s) => s.id === scope)

    const rows = SEED_PLAYERS.map((p) => {
      const mine = p.isMe ? this.mySeries() : null
      const points = mine ?? p.points
      const avgs = mine ? this.myAvgSeries() : p.avg
      const accs = mine ? this.myAccSeries() : p.acc

      const pts = setIndex < 0 ? points.reduce((a, b) => a + b, 0) : (points[setIndex] ?? 0)
      const playedAvg = setIndex < 0 ? avgs.filter((v) => v > 0) : avgs[setIndex] > 0 ? [avgs[setIndex]] : []
      const playedAcc = setIndex < 0 ? accs.filter((v) => v > 0) : accs[setIndex] > 0 ? [accs[setIndex]] : []

      return {
        userId: p.isMe && user ? user.id : p.id,
        name: p.isMe && user ? user.name : p.name,
        handle: p.isMe && user ? user.handle : p.handle,
        initials: p.isMe && user ? user.initials : initialsOf(p.name),
        points: pts,
        averageSeconds: playedAvg.length ? playedAvg.reduce((a, b) => a + b, 0) / playedAvg.length : 0,
        accuracy: playedAcc.length
          ? Math.round(playedAcc.reduce((a, b) => a + b, 0) / playedAcc.length)
          : 0,
        isMe: !!p.isMe,
      }
    })
      .filter((p) => p.points > 0)
      .sort((a, b) => b.points - a.points || a.averageSeconds - b.averageSeconds)

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({ ...r, rank: i + 1 }))
    const me = entries.find((e) => e.isMe)

    return delay({
      scope,
      entries,
      myRank: me?.rank ?? null,
      totalPlayers: entries.length,
    })
  }

  /** Mis puntos por set: la marca real si he jugado, si no la del seed. */
  private mySeries() {
    const base = SEED_PLAYERS.find((p) => p.isMe)!.points
    return this.sets.map((s, i) => this.myBest.get(s.id)?.points ?? base[i] ?? 0)
  }

  private myAvgSeries() {
    const base = SEED_PLAYERS.find((p) => p.isMe)!.avg
    return this.sets.map((s, i) => this.myBest.get(s.id)?.avg ?? base[i] ?? 0)
  }

  private myAccSeries() {
    const base = SEED_PLAYERS.find((p) => p.isMe)!.acc
    return this.sets.map((s, i) => this.myBest.get(s.id)?.accuracy ?? base[i] ?? 0)
  }

  /** Puesto que ocuparía una puntuación dentro de un set. */
  private rankForPoints(setId: string, points: number) {
    const i = this.sets.findIndex((s) => s.id === setId)
    if (i < 0) return 1
    const better = SEED_PLAYERS.filter((p) => !p.isMe && (p.points[i] ?? 0) > points).length
    return better + 1
  }

  // --- Administración ---

  async createQuestion(input: NewQuestionInput): Promise<QuizSet> {
    const set = this.sets.find((s) => s.id === input.setId)
    if (!set) throw new ApiError('Ese set no existe.', 404)

    const text = input.text.trim()
    const options = input.options.map((o, i) => o.trim() || `Opción ${'ABCD'[i]}`)
    if (!text) throw new ApiError('Falta el enunciado.', 400)
    if (input.options.filter((o) => o.trim()).length < 2) {
      throw new ApiError('Hacen falta al menos dos opciones.', 400)
    }

    set.questions.push({
      id: `${set.id}-${set.questions.length + 1}-${Date.now()}`,
      tag: input.level,
      text,
      options,
      correct: input.correct,
      why: input.why?.trim() || 'Pregunta añadida desde el panel.',
    })

    return delay(this.toPublicSet(set))
  }
}

const stripAnswer = (q: SeedQuestion): Question => ({
  id: q.id,
  tag: q.tag,
  text: q.text,
  code: q.code,
  options: q.options,
})
