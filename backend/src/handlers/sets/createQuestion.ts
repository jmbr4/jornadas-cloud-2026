import { randomUUID } from 'node:crypto'
import { requireAdmin } from '../../lib/auth.js'
import { badRequest, notFound, ok, parseBody, pathParam, withErrors } from '../../lib/http.js'
import { logger } from '../../lib/logger.js'
import { getRepository } from '../../repository/factory.js'
import { toQuizSet } from '../../services/setService.js'
import type { Level, QuestionRecord } from '../../domain/types.js'

interface Body {
  text?: string
  options?: string[]
  correct?: number
  level?: Level
  seconds?: number
  why?: string
}

const LEVELS: Level[] = ['Fácil', 'Media', 'Difícil']

/**
 * POST /sets/{setId}/questions
 *
 * Alta de pregunta desde el panel. Exige administración, no solo sesión: es
 * contenido que ve todo el mundo.
 *
 * Valida en el servidor. El formulario del navegador es una comodidad, no un
 * control de seguridad, igual que esconder el enlace del panel no protege la
 * ruta que hay detrás.
 */
export const handler = withErrors('POST /sets/{setId}/questions', async (event) => {
  const session = await requireAdmin(event)
  const setId = pathParam(event, 'setId')
  const body = parseBody<Body>(event)

  const repository = getRepository()
  const set = await repository.getSet(setId)
  if (!set) throw notFound('Ese set no existe.')

  const text = (body.text ?? '').trim()
  if (!text) throw badRequest('Falta el enunciado.')

  const given = Array.isArray(body.options) ? body.options : []
  if (given.filter((option) => option.trim()).length < 2) {
    throw badRequest('Hacen falta al menos dos opciones.')
  }
  const options = given.map((option, i) => option.trim() || `Opción ${'ABCD'[i] ?? i + 1}`)

  const correct = Number(body.correct ?? 0)
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    throw badRequest('La opción correcta no apunta a ninguna de las opciones.')
  }

  const level = LEVELS.includes(body.level as Level) ? (body.level as Level) : 'Media'

  const question: QuestionRecord = {
    id: `${setId}-${randomUUID()}`,
    setId,
    tag: level,
    text,
    options,
    correct,
    why: (body.why ?? '').trim() || 'Pregunta añadida desde el panel.',
    createdAt: new Date().toISOString(),
  }

  await repository.addQuestion(question)
  logger.info('pregunta creada', { userId: session.userId, setId, questionId: question.id })

  return ok(await toQuizSet(repository, set, session.userId))
})
