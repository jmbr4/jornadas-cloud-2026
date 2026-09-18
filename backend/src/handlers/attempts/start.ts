import { randomUUID } from 'node:crypto'
import { requireSession } from '../../lib/auth.js'
import { conflict, notFound, created, pathParam, withErrors } from '../../lib/http.js'
import { logger } from '../../lib/logger.js'
import { getRepository } from '../../repository/factory.js'
import { toPublicQuestion, type Attempt, type AttemptRecord } from '../../domain/types.js'

/**
 * POST /sets/{setId}/attempts
 *
 * Abre una partida. Devuelve las preguntas SIN la respuesta correcta
 * (`toPublicQuestion` la quita) y fija el orden en el intento, para que no
 * pueda cambiar a mitad de la partida.
 */
export const handler = withErrors('POST /sets/{setId}/attempts', async (event) => {
  const session = await requireSession(event)
  const setId = pathParam(event, 'setId')

  const repository = getRepository()
  const set = await repository.getSet(setId)
  if (!set) throw notFound('Ese set no existe.')

  const questions = await repository.listQuestions(setId)
  if (questions.length === 0) throw conflict('Este set todavía no tiene preguntas.')

  const now = new Date().toISOString()
  const record: AttemptRecord = {
    id: `att-${randomUUID()}`,
    userId: session.userId,
    setId,
    questionIds: questions.map((question) => question.id),
    secondsPerQuestion: set.secondsPerQuestion,
    answers: [],
    startedAt: now,
    // La primera pregunta se abre a la vez que la partida.
    questionStartedAt: now,
    score: 0,
    hits: 0,
  }

  await repository.createAttempt(record)
  await repository.incrementSetAttempts(setId)
  logger.info('partida iniciada', { userId: session.userId, setId, attemptId: record.id })

  const payload: Attempt = {
    attemptId: record.id,
    setId,
    setTitle: set.title,
    secondsPerQuestion: set.secondsPerQuestion,
    questions: questions.map(toPublicQuestion),
  }

  return created(payload)
})
