import { requireSession } from '../../lib/auth.js'
import { conflict, forbidden, notFound, ok, pathParam, withErrors } from '../../lib/http.js'
import { getRepository } from '../../repository/factory.js'

/**
 * POST /attempts/{attemptId}/questions/{questionId}/open
 *
 * El cliente avisa de que acaba de poner una pregunta delante del jugador, y
 * el servidor sella la hora con su propio reloj.
 *
 * Es lo que cierra el agujero del bonus por velocidad. Antes, el navegador
 * decía cuánto había tardado y podía decir «cero» siempre; ahora el tiempo es
 * la diferencia entre dos instantes que mide el servidor, y lo único que
 * puede hacer un cliente manipulado es esperar más, nunca menos.
 *
 * Hace falta una llamada por pregunta. Sale gratis en la práctica: ocurre
 * mientras el jugador está leyendo el enunciado.
 */
export const handler = withErrors(
  'POST /attempts/{attemptId}/questions/{questionId}/open',
  async (event) => {
    const session = await requireSession(event)
    const attemptId = pathParam(event, 'attemptId')
    const questionId = pathParam(event, 'questionId')

    const repository = getRepository()
    const attempt = await repository.getAttempt(attemptId)
    if (!attempt) throw notFound('La partida ya no está activa.')
    if (attempt.userId !== session.userId) throw forbidden('Esa partida no es tuya.')
    if (attempt.finishedAt) throw conflict('Esa partida ya está cerrada.')
    if (!attempt.questionIds.includes(questionId)) {
      throw notFound('Esa pregunta no pertenece a la partida.')
    }
    if (attempt.answers.some((answer) => answer.questionId === questionId)) {
      throw conflict('Esa pregunta ya estaba respondida.')
    }

    const opened = await repository.openQuestion(attemptId, new Date().toISOString())

    return ok({
      questionId,
      secondsPerQuestion: opened.secondsPerQuestion,
      // Para que el cronómetro del navegador arranque donde dice el servidor.
      openedAt: opened.questionStartedAt,
    })
  },
)
