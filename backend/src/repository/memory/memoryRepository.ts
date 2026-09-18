import type {
  AttemptAnswerRecord,
  AttemptRecord,
  MagicLinkRecord,
  QuestionRecord,
  ScoreRecord,
  SetRecord,
  UserRecord,
} from '../../domain/types.js'
import type { QuizRepository } from '../index.js'
import { SEED_QUESTIONS, SEED_SCORES, SEED_SETS, SEED_USERS } from './seed.js'

/**
 * Implementación en memoria del puerto.
 *
 * Sirve para desarrollar y probar las Lambdas sin infraestructura, y como
 * referencia de qué tiene que hacer exactamente cada método cuando lo
 * implementemos sobre DynamoDB.
 *
 * OJO: el estado vive en el contenedor de Lambda. Entre invocaciones puede
 * conservarse o no, y cada contenedor tiene el suyo. No es persistencia real:
 * es precisamente el motivo por el que hace falta una base de datos.
 */
export class MemoryRepository implements QuizRepository {
  private users = new Map<string, UserRecord>()
  private magicLinks = new Map<string, MagicLinkRecord>()
  private sets = new Map<string, SetRecord>()
  private questions = new Map<string, QuestionRecord>()
  private attempts = new Map<string, AttemptRecord>()
  private scores = new Map<string, ScoreRecord>()

  constructor() {
    for (const user of SEED_USERS) this.users.set(user.id, clone(user))
    for (const set of SEED_SETS) this.sets.set(set.id, clone(set))
    for (const question of SEED_QUESTIONS) this.questions.set(question.id, clone(question))
    for (const score of SEED_SCORES) this.scores.set(scoreKey(score.userId, score.setId), clone(score))
  }

  // --- Usuarios ---

  async getUser(userId: string) {
    return cloneOrNull(this.users.get(userId))
  }

  async findUserByEmail(email: string) {
    const needle = email.toLowerCase()
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === needle) return clone(user)
    }
    return null
  }

  async getUsers(userIds: string[]) {
    return userIds.flatMap((id) => {
      const user = this.users.get(id)
      return user ? [clone(user)] : []
    })
  }

  async findUserByHandle(handle: string) {
    const needle = handle.trim().toLowerCase()
    for (const user of this.users.values()) {
      if (user.handle?.toLowerCase() === needle) return clone(user)
    }
    return null
  }

  async saveProfile(userId: string, name: string, handle: string) {
    const taken = await this.findUserByHandle(handle)
    if (taken && taken.id !== userId) return null

    const user = this.users.get(userId)
    if (!user) throw new Error(`Usuario ${userId} no encontrado`)

    user.name = name
    user.handle = handle
    return clone(user)
  }

  async createUser(user: UserRecord) {
    this.users.set(user.id, clone(user))
    return clone(user)
  }

  // --- Enlaces mágicos ---

  async saveMagicLink(link: MagicLinkRecord) {
    this.magicLinks.set(link.token, clone(link))
  }

  async consumeMagicLink(token: string) {
    const link = this.magicLinks.get(token)
    if (!link) return null
    if (link.consumedAt) return null
    if (new Date(link.expiresAt).getTime() < Date.now()) return null

    link.consumedAt = new Date().toISOString()
    return clone(link)
  }

  // --- Catálogo ---

  async listSets() {
    return [...this.sets.values()].sort((a, b) => a.order - b.order).map(clone)
  }

  async getSet(setId: string) {
    return cloneOrNull(this.sets.get(setId))
  }

  async incrementSetAttempts(setId: string) {
    const set = this.sets.get(setId)
    if (set) set.attempts += 1
  }

  // --- Preguntas ---

  async listQuestions(setId: string) {
    return [...this.questions.values()]
      .filter((question) => question.setId === setId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(clone)
  }

  async getQuestion(setId: string, questionId: string) {
    const question = this.questions.get(questionId)
    return question && question.setId === setId ? clone(question) : null
  }

  async addQuestion(question: QuestionRecord) {
    this.questions.set(question.id, clone(question))
    return clone(question)
  }

  // --- Intentos ---

  async createAttempt(attempt: AttemptRecord) {
    this.attempts.set(attempt.id, clone(attempt))
    return clone(attempt)
  }

  async getAttempt(attemptId: string) {
    return cloneOrNull(this.attempts.get(attemptId))
  }

  async openQuestion(attemptId: string, at: string) {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new Error(`Intento ${attemptId} no encontrado`)

    attempt.questionStartedAt = at
    return clone(attempt)
  }

  async appendAnswer(attemptId: string, answer: AttemptAnswerRecord) {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new Error(`Intento ${attemptId} no encontrado`)

    attempt.answers.push(clone(answer))
    attempt.score += answer.points
    if (answer.correct) attempt.hits += 1
    return clone(attempt)
  }

  async finishAttempt(attemptId: string) {
    const attempt = this.attempts.get(attemptId)
    if (!attempt) throw new Error(`Intento ${attemptId} no encontrado`)

    attempt.finishedAt ??= new Date().toISOString()
    return clone(attempt)
  }

  // --- Marcas ---

  async listScores(setId?: string) {
    return [...this.scores.values()]
      .filter((score) => setId === undefined || score.setId === setId)
      .map(clone)
  }

  async getScore(userId: string, setId: string) {
    return cloneOrNull(this.scores.get(scoreKey(userId, setId)))
  }

  async saveBestScore(score: ScoreRecord) {
    const key = scoreKey(score.userId, score.setId)
    const previous = this.scores.get(key)
    // Solo se guarda si mejora: el leaderboard muestra la mejor marca, no la última.
    if (!previous || score.points > previous.points) {
      this.scores.set(key, clone(score))
    }
  }
}

const scoreKey = (userId: string, setId: string) => `${userId}#${setId}`

const clone = <T>(value: T): T => structuredClone(value)
const cloneOrNull = <T>(value: T | undefined): T | null =>
  value === undefined ? null : structuredClone(value)
