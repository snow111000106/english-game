import { mergeCurriculum, rewardCatalog } from '../data/curriculum'
import type { DailyMission, GameState, LearningItem, MissionTask, Reward } from '../types'
import { createInitialGardenPlots, createInitialInventory } from './economy'
import { getMasteryScore, getWeakItemIds } from './mastery'

export const todayKey = (date = new Date()) => date.toISOString().slice(0, 10)

const daySeed = (date: string) =>
  date.split('').reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 17)

const seededSort = <T extends { id: string }>(items: T[], date: string) => {
  const seed = daySeed(date)
  return [...items].sort((a, b) => {
    const left = hash(`${a.id}-${seed}`)
    const right = hash(`${b.id}-${seed}`)
    return left - right
  })
}

const hash = (text: string) => {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value << 5) - value + text.charCodeAt(index)
    value |= 0
  }
  return Math.abs(value)
}

const unique = <T>(items: T[]) => Array.from(new Set(items))

const daysBetween = (left: string, right: string) => {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.floor((new Date(left).getTime() - new Date(right).getTime()) / dayMs)
}

const itemScore = (item: LearningItem, state: GameState, date: string) => {
  const profile = state.learnerProfile
  const mastery = state.mastery[item.id]
  const masteryScore = getMasteryScore(mastery)
  const dueDays = mastery ? daysBetween(date, mastery.lastPracticedAt.slice(0, 10)) : Number.POSITIVE_INFINITY
  const isDue = !mastery || dueDays >= item.reviewIntervalDays
  const ageMatch = profile.age >= item.ageRange[0] && profile.age <= item.ageRange[1]
  const levelMatch = profile.level === 'a1' || item.level === 'pre-a1'
  const themeBoost = profile.focusThemes.includes(item.theme) ? 18 : 0
  const weakBoost = mastery && masteryScore < 72 ? 36 : 0
  const dueBoost = isDue ? 24 : -18
  const newBoost = mastery ? 0 : 16

  return item.priority + themeBoost + weakBoost + dueBoost + newBoost + (ageMatch ? 8 : -12) + (levelMatch ? 8 : -16) - item.difficulty * 3
}

const getRecommendedCurriculum = (state: GameState, date: string) =>
  seededSort(mergeCurriculum(state.customCurriculum), date)
    .sort((a, b) => itemScore(b, state, date) - itemScore(a, state, date))

const getPreviousMission = (state: GameState) =>
  [...state.missions]
    .filter((mission) => mission.date < todayKey())
    .sort((a, b) => b.date.localeCompare(a.date))[0]

export const balanceMissionSkills = (mission: DailyMission): DailyMission => {
  if (mission.tasks.some((task) => task.skill === 'listen')) return mission

  return {
    ...mission,
    tasks: mission.tasks.map((task, index) => {
      const skill = index % 3 === 0 ? 'listen' : 'speak'
      return {
        ...task,
        skill,
        id: `${mission.date}-${task.itemId}-${skill}`,
      }
    }),
  }
}

export const createInitialRewards = () =>
  rewardCatalog.reduce<Record<string, Reward>>((acc, reward) => {
    acc[reward.id] = { ...reward }
    return acc
  }, {})

export const createInitialState = (): GameState => ({
  missions: [],
  results: [],
  mastery: {},
  rewards: createInitialRewards(),
  ingredients: {
    strawberry: 0,
    pearl: 0,
    tea: 0,
    milk: 0,
  },
  inventory: createInitialInventory(),
  gardenPlots: createInitialGardenPlots(),
  lotteryHistory: [],
  treatPoints: 0,
  eggTarts: 0,
  bobaCups: 0,
  unlockedCharacters: ['round-hero'],
  customCurriculum: [],
  learnerProfile: {
    age: 6,
    level: 'pre-a1',
    focusThemes: ['greetings', 'food', 'animals', 'colors', 'numbers'],
  },
  streak: 0,
  totalStars: 0,
  starBank: 0,
})

export const generateDailyMission = (state: GameState, date = todayKey()): DailyMission => {
  const existing = state.missions.find((mission) => mission.date === date)
  if (existing) return balanceMissionSkills(existing)

  const previous = getPreviousMission(state)
  const unfinishedIds = previous
    ? previous.tasks.filter((task) => !task.completed).map((task) => task.itemId)
    : []
  const weakIds = getWeakItemIds(state).filter(
    (id) => getMasteryScore(state.mastery[id]) < 72,
  )
  const recommendedCurriculum = getRecommendedCurriculum(state, date)
  const newIds = seededSort(
    recommendedCurriculum.filter((item) => !state.mastery[item.id] && !unfinishedIds.includes(item.id)),
    date,
  ).map((item) => item.id)
  const reviewIds = seededSort(
    recommendedCurriculum.filter((item) => state.mastery[item.id] && !weakIds.includes(item.id)),
    date,
  ).map((item) => item.id)

  const targetCount = 10
  const selectedIds = unique([...unfinishedIds, ...weakIds, ...newIds, ...reviewIds]).slice(
    0,
    targetCount,
  )

  const tasks: MissionTask[] = selectedIds.map((itemId, index) => {
    const skill = index % 3 === 0 ? 'listen' : 'speak'
    return {
      id: `${date}-${itemId}-${skill}`,
      itemId,
      skill,
      completed: false,
      stars: 0,
    }
  })

  const reward = seededSort(rewardCatalog, date)[0]

  return {
    date,
    tasks,
    completed: false,
    rewardId: reward.id,
    lotteryClaimed: false,
  }
}

export const applyMissionToState = (state: GameState, mission: DailyMission): GameState => ({
  ...state,
  missions: state.missions.some((item) => item.date === mission.date)
    ? state.missions.map((item) => (item.date === mission.date ? mission : item))
    : [...state.missions, mission],
})
