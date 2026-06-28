import type { SpeechScore } from '../types'

export const normalizeSpeechText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const levenshtein = (left: string, right: string) => {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  )

  for (let index = 0; index <= left.length; index += 1) matrix[index][0] = index
  for (let index = 0; index <= right.length; index += 1) matrix[0][index] = index

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      matrix[leftIndex][rightIndex] = Math.min(
        matrix[leftIndex - 1][rightIndex] + 1,
        matrix[leftIndex][rightIndex - 1] + 1,
        matrix[leftIndex - 1][rightIndex - 1] + cost,
      )
    }
  }

  return matrix[left.length][right.length]
}

export const scoreSpeech = (
  target: string,
  transcript: string,
  confidence = 0.7,
): SpeechScore => {
  const normalizedTarget = normalizeSpeechText(target)
  const normalizedTranscript = normalizeSpeechText(transcript)

  if (!normalizedTranscript) {
    return {
      stars: 0,
      score: 0,
      transcript,
      message: '没有听清楚，再试一次吧。',
    }
  }

  const distance = levenshtein(normalizedTarget, normalizedTranscript)
  const maxLength = Math.max(normalizedTarget.length, normalizedTranscript.length, 1)
  const similarity = 1 - distance / maxLength
  const containsBonus = normalizedTranscript.includes(normalizedTarget) ? 0.08 : 0
  const score = Math.round(Math.min(1, similarity * 0.82 + confidence * 0.18 + containsBonus) * 100)
  const stars = score >= 86 ? 3 : score >= 68 ? 2 : 1
  const message =
    stars === 3
      ? '太棒啦！发音很标准，获得 3 颗星！'
      : stars === 2
        ? '很接近啦！再慢慢说一次会更好。'
        : '勇敢开口就是胜利，我们再练一次。'

  return { stars, score, transcript, message }
}
