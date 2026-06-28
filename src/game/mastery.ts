import type { GameState, MasteryRecord, PracticeResult } from '../types'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export const getMasteryScore = (record?: MasteryRecord) => {
  if (!record) return 0
  const attemptsScore = clamp(record.attempts / 6, 0, 1)
  const starsScore = record.averageStars / 3
  return Math.round((attemptsScore * 0.35 + starsScore * 0.65) * 100)
}

export const updateMastery = (
  mastery: GameState['mastery'],
  result: PracticeResult,
): GameState['mastery'] => {
  const previous = mastery[result.itemId]
  const attempts = (previous?.attempts ?? 0) + 1
  const averageStars = previous
    ? (previous.averageStars * previous.attempts + result.stars) / attempts
    : result.stars

  return {
    ...mastery,
    [result.itemId]: {
      itemId: result.itemId,
      attempts,
      averageStars,
      lastStars: result.stars,
      lastPracticedAt: result.createdAt,
    },
  }
}

export const getWeakItemIds = (state: GameState) =>
  Object.values(state.mastery)
    .sort((a, b) => {
      const scoreDiff = getMasteryScore(a) - getMasteryScore(b)
      if (scoreDiff !== 0) return scoreDiff
      return new Date(a.lastPracticedAt).getTime() - new Date(b.lastPracticedAt).getTime()
    })
    .map((record) => record.itemId)
