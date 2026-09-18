import { requireSession } from '../../lib/auth.js'
import { ok, withErrors } from '../../lib/http.js'
import { getRepository } from '../../repository/factory.js'
import { toQuizSet } from '../../services/setService.js'

/**
 * GET /sets
 *
 * Catálogo para el lobby. Incluye la mejor marca del usuario en cada set,
 * por eso necesita sesión.
 */
export const handler = withErrors('GET /sets', async (event) => {
  const session = await requireSession(event)
  const repository = getRepository()

  const sets = await repository.listSets()
  const payload = await Promise.all(sets.map((set) => toQuizSet(repository, set, session.userId)))

  return ok(payload)
})
