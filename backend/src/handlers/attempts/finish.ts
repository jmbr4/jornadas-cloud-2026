import { requireSession } from '../../lib/auth.js'
import { forbidden, notFound, ok, pathParam, withErrors } from '../../lib/http.js'
import { putMetrics } from '../../lib/metrics.js'
import { getRepository } from '../../repository/factory.js'
import { accuracy, averageSeconds } from '../../domain/scoring.js'
import { rankForPoints } from '../../domain/leaderboard.js'
import type { AttemptSummary, ScoreRecord } from '../../domain/types.js'

/**
 * POST /attempts/{attemptId}/finish
 *
 * Cierra la partida, guarda la marca si mejora la anterior y devuelve el
 * resumen. Es idempotente: repetir la llamada devuelve lo mismo y no vuelve a
 * puntuar, porque `finishAttempt` conserva el `finishedAt` original y
 * `saveBestScore` solo escribe si la puntuación mejora.
 */
export const handler = withErrors('POST /attempts/{attemptId}/finish', async (event) => {
  const session = await requireSession(event)
  const attemptId = pathParam(event, 'attemptId')

  const repository = getRepository()
  const attempt = await repository.getAttempt(attemptId)
  if (!attempt) throw notFound('La partida ya no está activa.')
  if (attempt.userId !== session.userId) throw forbidden('Esa partida no es tuya.')

  const [set, closed] = await Promise.all([
    repository.getSet(attempt.setId),
    repository.finishAttempt(attemptId),
  ])
  if (!set) throw notFound('Ese set ya no existe.')

  const total = closed.questionIds.length
  const average = averageSeconds(closed.answers.map((answer) => answer.elapsedSeconds))

  const score: ScoreRecord = {
    userId: session.userId,
    setId: closed.setId,
    points: closed.score,
    averageSeconds: average,
    accuracy: accuracy(closed.hits, total),
    updatedAt: new Date().toISOString(),
  }
  await repository.saveBestScore(score)

  const scores = await repository.listScores(closed.setId)

  // La métrica del producto, no la de la infraestructura: cuánto puntúa la
  // gente y cuánto acierta, por set. El número de partidas terminadas no se
  // cuenta aparte — es el `SampleCount` de `AttemptScore`.
  putMetrics({
    message: 'partida cerrada',
    metrics: [
      { name: 'AttemptScore', value: closed.score, unit: 'None' },
      { name: 'AttemptAccuracy', value: score.accuracy, unit: 'Percent' },
      { name: 'AttemptSeconds', value: average, unit: 'Seconds' },
    ],
    dimensions: { setId: closed.setId },
    properties: { userId: session.userId, attemptId, hits: closed.hits, questions: total },
    total: true,
  })

  const payload: AttemptSummary = {
    attemptId: closed.id,
    setId: closed.setId,
    setTitle: set.title,
    score: closed.score,
    hits: closed.hits,
    total,
    averageSeconds: average,
    setRank: rankForPoints(scores, closed.score, session.userId),
  }

  return ok(payload)
})
