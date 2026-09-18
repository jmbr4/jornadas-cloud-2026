import { isAdminEmail, requireSession } from '../lib/auth.js'
import { notFound, ok, withErrors } from '../lib/http.js'
import { getRepository } from '../repository/factory.js'
import { loadMyRanking } from '../services/boardService.js'
import { toPublicUser } from '../domain/types.js'

/**
 * GET /me
 *
 * Perfil del usuario de la sesión, con su puesto global. El frontend lo llama
 * al arrancar, antes de la primera navegación, así que toda la aplicación
 * espera a esta respuesta: conviene que sea barata.
 *
 * Calcula el puesto a partir de las marcas, sin resolver ningún perfil ajeno.
 */
export const handler = withErrors('GET /me', async (event) => {
  const session = await requireSession(event)
  const repository = getRepository()

  // El correo del token ya sirve para saber si es administrador, así que esa
  // consulta no tiene que esperar a leer la ficha.
  const [user, ranking, admin] = await Promise.all([
    repository.getUser(session.userId),
    loadMyRanking(repository, session.userId),
    isAdminEmail(session.email),
  ])

  if (!user) throw notFound('El perfil ya no existe.')

  return ok(
    toPublicUser(user, ranking.myRank ?? ranking.totalPlayers + 1, ranking.myPoints, admin),
  )
})
