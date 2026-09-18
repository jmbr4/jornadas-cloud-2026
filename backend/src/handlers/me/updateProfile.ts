import { isAdminEmail, normalizeHandle, normalizeName, requireSession } from '../../lib/auth.js'
import { badRequest, conflict, notFound, ok, parseBody, withErrors } from '../../lib/http.js'
import { logger } from '../../lib/logger.js'
import { getRepository } from '../../repository/factory.js'
import { loadMyRanking } from '../../services/boardService.js'
import { toPublicUser } from '../../domain/types.js'

interface Body {
  name?: string
  handle?: string
}

/**
 * POST /me/profile
 *
 * Fija el nombre visible y el handle la primera vez que alguien entra.
 *
 * Existe para que nada público se derive del correo: si el handle saliera de
 * la dirección, el leaderboard estaría publicando quién es cada persona.
 *
 * Solo se puede fijar una vez. Permitir cambiarlo obligaría a liberar el
 * handle anterior y a decidir si alguien puede quedarse con el nombre que
 * otro acaba de dejar; no hace falta para esto.
 */
export const handler = withErrors('POST /me/profile', async (event) => {
  const session = await requireSession(event)
  const body = parseBody<Body>(event)

  const name = normalizeName(body.name ?? '')
  if (!name) throw badRequest('El nombre debe tener entre 2 y 40 caracteres.')

  const handle = normalizeHandle(body.handle ?? '')
  if (!handle) {
    throw badRequest('El handle admite de 3 a 20 letras, números o guiones bajos.')
  }

  const repository = getRepository()
  const current = await repository.getUser(session.userId)
  if (!current) throw notFound('El perfil ya no existe.')
  if (current.handle) throw conflict('Tu perfil ya está creado.')

  const updated = await repository.saveProfile(session.userId, name, handle)
  if (!updated) throw conflict('Ese handle ya está cogido. Prueba con otro.')

  logger.info('perfil creado', { userId: updated.id, handle })

  const [ranking, admin] = await Promise.all([
    loadMyRanking(repository, updated.id),
    isAdminEmail(updated.email),
  ])

  return ok(
    toPublicUser(updated, ranking.myRank ?? ranking.totalPlayers + 1, ranking.myPoints, admin),
  )
})
