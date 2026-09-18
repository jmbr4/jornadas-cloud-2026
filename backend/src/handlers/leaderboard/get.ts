import { requireSession } from '../../lib/auth.js'
import { badRequest, ok, withErrors } from '../../lib/http.js'
import { getRepository } from '../../repository/factory.js'
import { loadLeaderboard } from '../../services/boardService.js'

/**
 * GET /leaderboard?scope=all|{setId}
 *
 * `scope=all` suma las marcas de todos los sets; un `setId` restringe a ese.
 */
export const handler = withErrors('GET /leaderboard', async (event) => {
  const session = await requireSession(event)
  const scope = (event.queryStringParameters?.['scope'] ?? 'all').trim()

  const repository = getRepository()

  if (scope !== 'all') {
    const set = await repository.getSet(scope)
    if (!set) throw badRequest('Ese ámbito no existe.')
  }

  return ok(await loadLeaderboard(repository, scope, session.userId))
})
