import { rankForPoints } from '../domain/leaderboard.js'
import type { QuizSet, SetRecord } from '../domain/types.js'
import type { QuizRepository } from '../repository/index.js'

/**
 * Convierte un set persistido en el objeto que consume el lobby, añadiendo
 * el número de preguntas y la mejor marca del usuario.
 */
export async function toQuizSet(
  repository: QuizRepository,
  set: SetRecord,
  userId: string,
): Promise<QuizSet> {
  const [questions, scores, mine] = await Promise.all([
    repository.listQuestions(set.id),
    repository.listScores(set.id),
    repository.getScore(userId, set.id),
  ])

  return {
    id: set.id,
    category: set.category,
    level: set.level,
    title: set.title,
    blurb: set.blurb,
    questionCount: questions.length,
    secondsPerQuestion: set.secondsPerQuestion,
    attempts: set.attempts,
    status: set.status,
    // "820 pts · #10" — la marca y el puesto que le corresponde en ese set.
    best: mine ? `${mine.points} pts · #${rankForPoints(scores, mine.points, userId)}` : null,
  }
}
