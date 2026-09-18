import { hydrate, rankScores, type Ranking } from '../domain/leaderboard.js'
import { config } from '../lib/config.js'
import type { Leaderboard, UserRecord } from '../domain/types.js'
import type { QuizRepository } from '../repository/index.js'

/**
 * Carga la clasificación de un ámbito.
 *
 * El trabajo va en dos tiempos a propósito: primero se ordenan las marcas
 * (solo números, sin tocar los perfiles) y después se resuelven los nombres
 * **únicamente de las filas que se van a enseñar**.
 *
 * Antes se resolvía un perfil por cada jugador con marca. Con 852 jugadores
 * eso eran 852 lecturas para pintar doce filas, y `/me` pagaba lo mismo solo
 * para saber en qué puesto vas.
 */
export async function loadLeaderboard(
  repository: QuizRepository,
  scope: string,
  meUserId: string | null,
): Promise<Leaderboard> {
  const scores = await repository.listScores(scope === 'all' ? undefined : scope)
  const ranking = rankScores(scores, meUserId)

  const visible = ranking.rows.slice(0, config.leaderboardSize)
  const records = await repository.getUsers(visible.map((row) => row.userId))
  const users = new Map<string, UserRecord>(records.map((user) => [user.id, user]))

  return {
    scope,
    entries: hydrate(visible, users),
    myRank: ranking.myRank,
    totalPlayers: ranking.totalPlayers,
  }
}

/**
 * Solo el puesto y los puntos de una persona.
 *
 * Es lo que necesitan `/me`, `/auth/verify` y el alta de perfil para pintar el
 * «puesto global» de la cabecera. Ninguno de los tres necesita nombres, así
 * que ninguno lee un solo perfil.
 */
export async function loadMyRanking(
  repository: QuizRepository,
  meUserId: string,
): Promise<Ranking> {
  const scores = await repository.listScores()
  return rankScores(scores, meUserId)
}
