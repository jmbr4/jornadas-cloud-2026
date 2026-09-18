/**
 * Mapa de claves de la tabla única.
 *
 * Todo el conocimiento sobre cómo se forman PK y SK vive aquí y en ningún
 * otro sitio: si mañana cambia el modelo, se cambia este fichero.
 *
 *   PK                 SK                entidad
 *   ─────────────────────────────────────────────────────────────────
 *   SETS               SET#<setId>       set          (listSets = 1 Query)
 *   SET#<setId>        QUESTION#<qid>    pregunta     (listQuestions = 1 Query)
 *   USER#<userId>      PROFILE           usuario
 *   EMAIL#<email>      USER              puntero -> userId
 *   HANDLE#<handle>    USER              puntero -> userId (garantiza unicidad)
 *   LINK#<token>       LINK              enlace mágico (con TTL)
 *   ATTEMPT#<id>       META              intento + sus respuestas
 *   SCORES#<setId>     USER#<userId>     mejor marca
 *
 *   GSI1: GSI1PK = SCORES#<setId>, GSI1SK = points (número)
 *         Ordena las marcas por puntuación, que es lo que la tabla base no
 *         sabe hacer: ahí la sort key es el usuario.
 *
 * Los sets cuelgan de una partición fija `SETS` y las preguntas de la
 * partición del set. Así listSets y listQuestions son cada una una Query, y
 * nunca hace falta un Scan.
 */

export interface TableKey {
  PK: string
  SK: string
}

export const keys = {
  set: (setId: string): TableKey => ({ PK: 'SETS', SK: `SET#${setId}` }),
  setsPartition: 'SETS',

  question: (setId: string, questionId: string): TableKey => ({
    PK: `SET#${setId}`,
    SK: `QUESTION#${questionId}`,
  }),
  questionsPartition: (setId: string) => `SET#${setId}`,
  questionPrefix: 'QUESTION#',

  user: (userId: string): TableKey => ({ PK: `USER#${userId}`, SK: 'PROFILE' }),

  email: (email: string): TableKey => ({
    PK: `EMAIL#${email.trim().toLowerCase()}`,
    SK: 'USER',
  }),

  /**
   * El handle público. Mismo truco que el email: un ítem cuya sola existencia
   * reserva el nombre, lo que permite garantizar unicidad con una condición.
   */
  handle: (handle: string): TableKey => ({
    PK: `HANDLE#${handle.trim().toLowerCase()}`,
    SK: 'USER',
  }),

  link: (token: string): TableKey => ({ PK: `LINK#${token}`, SK: 'LINK' }),

  attempt: (attemptId: string): TableKey => ({ PK: `ATTEMPT#${attemptId}`, SK: 'META' }),

  score: (setId: string, userId: string): TableKey => ({
    PK: `SCORES#${setId}`,
    SK: `USER#${userId}`,
  }),
  scoresPartition: (setId: string) => `SCORES#${setId}`,
} as const

export const GSI1 = 'GSI1' as const

/** Atributos del índice que ordena las marcas por puntos. */
export const gsi1ForScore = (setId: string, points: number) => ({
  GSI1PK: keys.scoresPartition(setId),
  GSI1SK: points,
})
