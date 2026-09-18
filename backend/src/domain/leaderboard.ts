import type { LeaderboardEntry, ScoreRecord, UserRecord } from './types.js'
import { initialsOf, publicHandle, publicName } from './types.js'

/** Una posición de la tabla, todavía sin nombre: solo números. */
export interface RankedScore {
  rank: number
  userId: string
  points: number
  averageSeconds: number
  accuracy: number
  isMe: boolean
}

export interface Ranking {
  rows: RankedScore[]
  myRank: number | null
  myPoints: number
  totalPlayers: number
}

/**
 * Ordena y numera las marcas. **No necesita los perfiles.**
 *
 * Esa separación es el motivo de que esto exista: calcular un puesto solo
 * requiere números, mientras que poner nombres exige leer una ficha por
 * jugador. Antes se hacían las dos cosas juntas, así que responder «¿qué
 * puesto ocupo?» leía los 852 perfiles de la base de datos.
 *
 * Lógica pura: no toca la base de datos. Cuando el volumen crezca, esta
 * agregación es lo primero que hay que mover a un ítem de totales mantenido
 * al escribir, en vez de recalcularla en cada petición.
 */
export function rankScores(scores: ScoreRecord[], meUserId: string | null): Ranking {
  const byUser = new Map<string, ScoreRecord[]>()
  for (const score of scores) {
    const list = byUser.get(score.userId)
    if (list) list.push(score)
    else byUser.set(score.userId, [score])
  }

  const rows = [...byUser.entries()]
    .flatMap(([userId, userScores]) => {
      const points = userScores.reduce((total, score) => total + score.points, 0)
      if (points <= 0) return []

      const played = userScores.filter((score) => score.averageSeconds > 0)
      const rated = userScores.filter((score) => score.accuracy > 0)

      return [
        {
          userId,
          points,
          averageSeconds: mean(played.map((score) => score.averageSeconds)),
          accuracy: Math.round(mean(rated.map((score) => score.accuracy))),
          isMe: userId === meUserId,
        },
      ]
    })
    // Más puntos primero; a igualdad de puntos, gana quien tardó menos.
    .sort((a, b) => b.points - a.points || a.averageSeconds - b.averageSeconds)
    .map((row, index) => ({ ...row, rank: index + 1 }))

  const me = rows.find((row) => row.isMe)

  return {
    rows,
    myRank: me?.rank ?? null,
    myPoints: me?.points ?? 0,
    totalPlayers: rows.length,
  }
}

/**
 * Pone nombre a un tramo ya ordenado.
 *
 * Solo se resuelven los perfiles de las filas que se van a enseñar, no los de
 * todos los jugadores: el puesto ya está calculado y no depende del nombre.
 */
export function hydrate(
  rows: RankedScore[],
  users: Map<string, UserRecord>,
): LeaderboardEntry[] {
  return rows.map((row) => {
    const user = users.get(row.userId)
    return {
      ...row,
      name: user ? publicName(user) : 'Sin nombre',
      handle: user ? publicHandle(user) : '',
      initials: initialsOf(user ? publicName(user) : ''),
    }
  })
}

/** Puesto que ocuparía una puntuación dada dentro de un conjunto de marcas. */
export function rankForPoints(
  scores: ScoreRecord[],
  points: number,
  excludeUserId?: string,
): number {
  const better = scores.filter(
    (score) => score.userId !== excludeUserId && score.points > points,
  ).length
  return better + 1
}

const mean = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
