import { requireSession } from '../../lib/auth.js'
import { config } from '../../lib/config.js'
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  parseBody,
  pathParam,
  withErrors,
} from '../../lib/http.js'
import { putMetrics } from '../../lib/metrics.js'
import { getRepository } from '../../repository/factory.js'
import { scoreAnswer } from '../../domain/scoring.js'
import type { AnswerResult, AttemptAnswerRecord, AttemptRecord } from '../../domain/types.js'

interface Body {
  questionId?: string
  /** null = se agotó el tiempo. */
  choice?: number | null
}

/**
 * POST /attempts/{attemptId}/answers
 *
 * Corrige una respuesta y devuelve el veredicto. Aquí está el corazón del
 * asunto: la comparación con `correct`, el cronómetro y el cálculo de puntos
 * ocurren en el servidor. El cliente solo dice qué opción eligió.
 */
export const handler = withErrors('POST /attempts/{attemptId}/answers', async (event) => {
  const session = await requireSession(event)
  const attemptId = pathParam(event, 'attemptId')
  const body = parseBody<Body>(event)

  const repository = getRepository()
  const attempt = await repository.getAttempt(attemptId)
  if (!attempt) throw notFound('La partida ya no está activa.')
  if (attempt.userId !== session.userId) throw forbidden('Esa partida no es tuya.')
  if (attempt.finishedAt) throw conflict('Esa partida ya está cerrada.')

  const questionId = (body.questionId ?? '').trim()
  if (!questionId) throw badRequest('Falta la pregunta.')
  if (!attempt.questionIds.includes(questionId)) {
    throw badRequest('Esa pregunta no pertenece a la partida.')
  }
  if (attempt.answers.some((answer) => answer.questionId === questionId)) {
    throw conflict('Esa pregunta ya estaba respondida.')
  }

  const question = await repository.getQuestion(attempt.setId, questionId)
  if (!question) throw notFound('Pregunta desconocida.')

  const choice =
    body.choice === null || body.choice === undefined ? null : Number(body.choice)
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length)) {
    throw badRequest('La opción elegida no existe.')
  }

  const correct = choice !== null && choice === question.correct
  const elapsedSeconds = elapsedFor(attempt)

  const breakdown = scoreAnswer({
    correct,
    elapsedSeconds,
    secondsPerQuestion: attempt.secondsPerQuestion,
    speedBonusMax: config.speedBonusMax,
  })

  const record: AttemptAnswerRecord = {
    questionId,
    choice,
    correct,
    points: breakdown.points,
    elapsedSeconds,
    answeredAt: new Date().toISOString(),
  }

  await repository.appendAnswer(attemptId, record)

  // El porcentaje de aciertos no es una métrica aparte: es la **media** de
  // esta, que vale 100 o 0. CloudWatch la calcula con el estadístico Average
  // y por dimensión, así que el mismo número dice qué set se le atraganta a
  // la gente sin escribir ninguna consulta. Y su SampleCount, de regalo, es
  // cuántas respuestas se han dado.
  //
  // `setId` es dimensión porque hay un puñado de sets. `questionId`, `userId`
  // y `attemptId` van como propiedades: son irrepetibles, y como dimensiones
  // crearían una métrica de pago por cada pregunta, persona y partida.
  putMetrics({
    message: 'respuesta registrada',
    metrics: [
      { name: 'AnswerAccuracy', value: correct ? 100 : 0, unit: 'Percent' },
      { name: 'AnswerSeconds', value: elapsedSeconds, unit: 'Seconds' },
    ],
    dimensions: { setId: attempt.setId },
    properties: {
      userId: session.userId,
      attemptId,
      questionId,
      correct,
      points: breakdown.points,
    },
    total: true,
  })

  const payload: AnswerResult = {
    correct,
    correctIndex: question.correct,
    why: question.why,
    points: breakdown.points,
    basePoints: breakdown.basePoints,
    speedBonus: breakdown.speedBonus,
  }

  return ok(payload)
})

/**
 * Cuánto tardó, según el reloj del servidor.
 *
 * Se mide contra `questionStartedAt`, que sella la ruta `.../open` cuando el
 * cliente pone la pregunta en pantalla. El navegador ya no interviene: su
 * cronómetro solo sirve para pintar la cuenta atrás.
 *
 * Un cliente manipulado puede retrasar el aviso de apertura y así aparentar
 * que tardó menos, pero para eso tiene que esperar de verdad: no puede
 * declarar cero. El peor caso ya no es "bonus máximo siempre", sino
 * "responder antes de que el servidor sepa que empezaste", que no da ventaja.
 */
function elapsedFor(attempt: AttemptRecord): number {
  const since = attempt.questionStartedAt || attempt.startedAt
  const seconds = (Date.now() - new Date(since).getTime()) / 1000
  if (!Number.isFinite(seconds)) return attempt.secondsPerQuestion
  return Math.min(Math.max(seconds, 0), attempt.secondsPerQuestion)
}
