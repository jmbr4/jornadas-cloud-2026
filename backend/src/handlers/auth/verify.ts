import { randomUUID } from 'node:crypto'
import { createSessionToken, isAdminEmail } from '../../lib/auth.js'
import { badRequest, ok, parseBody, unauthorized, withErrors } from '../../lib/http.js'
import { logger } from '../../lib/logger.js'
import { getRepository } from '../../repository/factory.js'
import { loadMyRanking } from '../../services/boardService.js'
import { toPublicUser, type UserRecord } from '../../domain/types.js'

interface Body {
  token?: string
}

/**
 * POST /auth/verify
 *
 * Canjea el token del enlace por una sesión. El enlace se consume en el mismo
 * acto: un segundo intento con el mismo token falla.
 *
 * Si el correo no tenía cuenta, se crea aquí vacía. El usuario vuelve con
 * `profileComplete: false` y el frontend le lleva a elegir nombre y handle.
 */
export const handler = withErrors('POST /auth/verify', async (event) => {
  const body = parseBody<Body>(event)
  const token = (body.token ?? '').trim()
  if (!token) throw badRequest('Falta el token del enlace.')

  const repository = getRepository()
  const link = await repository.consumeMagicLink(token)
  if (!link) throw unauthorized('El enlace ha caducado o ya se ha usado.')

  let user = await repository.findUserByEmail(link.email)
  if (!user) {
    // Se crea sin nombre ni handle: los elige la persona en el paso siguiente.
    // Derivarlos del correo publicaría su dirección en el leaderboard.
    const record: UserRecord = {
      id: `u-${randomUUID()}`,
      email: link.email,
      createdAt: new Date().toISOString(),
    }
    user = await repository.createUser(record)
    logger.info('usuario creado', { userId: user.id })
  }

  const [ranking, admin] = await Promise.all([
    loadMyRanking(repository, user.id),
    isAdminEmail(user.email),
  ])

  return ok({
    sessionToken: await createSessionToken(user.id, user.email),
    user: toPublicUser(user, ranking.myRank ?? ranking.totalPlayers + 1, ranking.myPoints, admin),
  })
})
