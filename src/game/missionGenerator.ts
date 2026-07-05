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

const dailyMissionTaskCount = 10
const dailyReviewTaskCount = 3
const dailyNewTaskCount = 7
const dailyListeningTaskLimit = 2
const dailySpellingTaskLimit = 1

const listeningChoiceThemes = new Set(['food', 'animals', 'toys', 'school', 'body', 'nature', 'home', 'clothes'])

export const isListeningChoiceItem = (item?: LearningItem) =>
  Boolean(item && item.type === 'word' && listeningChoiceThemes.has(item.theme))

const skillForMissionItem = (itemId: string, index: number, items: LearningItem[]): MissionTask['skill'] => {
  const item = items.find((candidate) => candidate.id === itemId)
  return index % 3 === 0 && isListeningChoiceItem(item) ? 'listen' : 'speak'
}

const balanceTaskSkillLimits = (tasks: MissionTask[], items: LearningItem[]) => {
  let listeningCount = 0
  let spellingCount = 0

  return tasks.map((task, index) => {
    const item = items.find((candidate) => candidate.id === task.itemId)
    let skill = skillForMissionItem(task.itemId, index, items)

    if (skill === 'listen') {
      listeningCount += 1
      if (listeningCount > dailyListeningTaskLimit) skill = 'speak'
    }

    if (skill !== 'listen' && spellingCount < dailySpellingTaskLimit && item?.type === 'word') {
      skill = 'spell'
    }

    if (skill === 'spell') {
      spellingCount += 1
      if (spellingCount > dailySpellingTaskLimit || item?.type !== 'word') skill = 'speak'
    }

    return {
      ...task,
      skill,
    }
  })
}

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

const getPreviousDayOneStarIds = (state: GameState) => {
  const previous = getPreviousMission(state)
  if (!previous) return []

  return unique(
    previous.tasks
      .filter((task) => task.completed && task.stars === 1)
      .map((task) => task.itemId),
  )
}

export const balanceMissionSkills = (mission: DailyMission, items: LearningItem[] = mergeCurriculum([])): DailyMission => {
  const hasInvalidListenTask = mission.tasks.some((task) =>
    task.skill === 'listen' && !isListeningChoiceItem(items.find((item) => item.id === task.itemId)),
  )
  const listeningCount = mission.tasks.filter((task) => task.skill === 'listen').length
  const spellingCount = mission.tasks.filter((task) => task.skill === 'spell').length
  const hasInvalidSpellTask = mission.tasks.some((task) =>
    task.skill === 'spell' && items.find((item) => item.id === task.itemId)?.type !== 'word',
  )
  const needsBalancing = hasInvalidListenTask
    || hasInvalidSpellTask
    || listeningCount > dailyListeningTaskLimit
    || spellingCount > dailySpellingTaskLimit
    || spellingCount === 0

  if (mission.tasks.some((task) => task.skill === 'listen') && !needsBalancing) return mission

  return {
    ...mission,
    tasks: balanceTaskSkillLimits(mission.tasks, items).map((task) => ({
      ...task,
      id: `${mission.date}-${task.itemId}-${task.skill}`,
    })),
  }
}

const createMissionTasks = (itemIds: string[], date: string, items: LearningItem[]): MissionTask[] =>
  balanceTaskSkillLimits(itemIds.slice(0, dailyMissionTaskCount).map((itemId, index) => ({
    id: `${date}-${itemId}-${index}`,
    itemId,
    skill: 'speak',
    completed: false,
    stars: 0,
  })), items).map((task) => {
    return {
      ...task,
      id: `${date}-${task.itemId}-${task.skill}`,
    }
  })

const ensureMissionTaskCount = (mission: DailyMission, state: GameState, date: string): DailyMission => {
    const recommendedCurriculum = getRecommendedCurriculum(state, date)
    const balancedMission = balanceMissionSkills(mission, recommendedCurriculum)
  if (balancedMission.tasks.length >= dailyMissionTaskCount) return balancedMission

  const selectedIds = new Set(balancedMission.tasks.map((task) => task.itemId))
    const supplementIds = recommendedCurriculum
    .map((item) => item.id)
    .filter((itemId) => !selectedIds.has(itemId))
    .slice(0, dailyMissionTaskCount - balancedMission.tasks.length)
  if (!supplementIds.length) return balancedMission

  return {
    ...balancedMission,
    tasks: balanceTaskSkillLimits([
      ...balancedMission.tasks,
      ...supplementIds.map((itemId) => ({
        id: `${date}-${itemId}-speak`,
        itemId,
        skill: 'speak' as const,
        completed: false,
        stars: 0,
      })),
    ], recommendedCurriculum).map((task) => ({
      ...task,
      id: `${date}-${task.itemId}-${task.skill}`,
    })),
    completed: false,
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
  if (existing) return ensureMissionTaskCount(existing, state, date)

  const previous = getPreviousMission(state)
  const unfinishedIds = previous
    ? previous.tasks.filter((task) => !task.completed).map((task) => task.itemId)
    : []
  const previousDayOneStarIds = getPreviousDayOneStarIds(state)
  const weakIds = getWeakItemIds(state).filter(
    (id) => getMasteryScore(state.mastery[id]) < 72,
  )
  const recommendedCurriculum = getRecommendedCurriculum(state, date)
  const reviewIds = unique([
    ...previousDayOneStarIds,
    ...unfinishedIds,
    ...weakIds,
  ]).slice(0, dailyReviewTaskCount)
  const newIds = seededSort(
    recommendedCurriculum.filter(
      (item) => !state.mastery[item.id] && !reviewIds.includes(item.id),
    ),
    date,
  ).map((item) => item.id).slice(0, dailyNewTaskCount)
  const fallbackIds = seededSort(
    recommendedCurriculum.filter((item) => !reviewIds.includes(item.id) && !newIds.includes(item.id)),
    date,
  ).map((item) => item.id)

  const selectedIds = unique([...reviewIds, ...newIds, ...fallbackIds]).slice(0, dailyMissionTaskCount)

  const tasks = createMissionTasks(selectedIds, date, recommendedCurriculum)

  const reward = seededSort(rewardCatalog, date)[0]

  return {
    date,
    tasks,
    completed: false,
    rewardId: reward.id,
    lotteryClaimed: false,
    lotteryClaimedCount: 0,
  }
}

export const applyMissionToState = (state: GameState, mission: DailyMission): GameState => ({
  ...state,
  missions: state.missions.some((item) => item.date === mission.date)
    ? state.missions.map((item) => (item.date === mission.date ? mission : item))
    : [...state.missions, mission],
})
