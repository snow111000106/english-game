export type SkillType = 'listen' | 'speak'

export type Level = 'pre-a1' | 'a1'

export type RewardKind = 'seed' | 'drink' | 'sticker' | 'decor'

export type IngredientKind = 'strawberry' | 'pearl' | 'tea' | 'milk'

export type InventoryKey =
  | 'sunlight'
  | 'raindrop'
  | 'chickenFeed'
  | 'strawberrySeed'
  | 'wheatSeed'
  | 'chicken'
  | 'strawberry'
  | 'wheat'
  | 'flour'
  | 'egg'
  | 'pearl'
  | 'tea'
  | 'milk'
  | 'strawberryBoba'
  | 'eggTart'

export type GardenPlotKind = 'empty' | 'strawberry' | 'wheat' | 'chicken'

export type PracticeSource = 'daily' | 'free'

export interface LearningItem {
  id: string
  level: Level
  theme: string
  unit: string
  type: 'word' | 'phrase'
  text: string
  meaning: string
  emoji: string
  prompt: string
  tags: string[]
  ageRange: [number, number]
  difficulty: 1 | 2 | 3 | 4 | 5
  priority: number
  source: 'core' | 'extended' | 'custom'
  reviewIntervalDays: number
  audioSrc?: string
  imageSrc?: string
}

export interface MissionTask {
  id: string
  itemId: string
  skill: SkillType
  completed: boolean
  stars: number
}

export interface DailyMission {
  date: string
  tasks: MissionTask[]
  completed: boolean
  rewardId: string
  lotteryClaimed: boolean
}

export interface PracticeResult {
  id: string
  itemId: string
  skill: SkillType
  source: PracticeSource
  target: string
  heardText?: string
  stars: number
  score: number
  createdAt: string
}

export interface MasteryRecord {
  itemId: string
  attempts: number
  averageStars: number
  lastStars: number
  lastPracticedAt: string
}

export interface Reward {
  id: string
  kind: RewardKind
  name: string
  emoji: string
  description: string
  owned: number
}

export interface GardenPlot {
  id: string
  kind: GardenPlotKind
  ready: boolean
  sunlight: number
  raindrop: number
  fed: number
  chickens?: number
}

export interface LotteryRecord {
  id: string
  date: string
  label: string
  key?: InventoryKey
  emoji: string
  amount: number
  stars?: number
  createdAt: string
}

export interface LotteryPrize {
  key?: InventoryKey
  amount?: number
  stars?: number
  weight: number
}

export interface ShopItem {
  key: InventoryKey
  cost: number
  featured?: boolean
  shortcut?: boolean
}

export interface Recipe {
  id: string
  name: string
  emoji: string
  output: InventoryKey
  outputAmount: number
  inputs: Partial<Record<InventoryKey, number>>
  treatPoints: number
  description: string
}

export interface GameState {
  missions: DailyMission[]
  results: PracticeResult[]
  mastery: Record<string, MasteryRecord>
  rewards: Record<string, Reward>
  ingredients: Record<IngredientKind, number>
  inventory: Record<InventoryKey, number>
  gardenPlots: GardenPlot[]
  lotteryHistory: LotteryRecord[]
  treatPoints: number
  eggTarts: number
  bobaCups: number
  unlockedCharacters: string[]
  customCurriculum: LearningItem[]
  learnerProfile: {
    age: number
    level: Level
    focusThemes: string[]
  }
  streak: number
  totalStars: number
  starBank: number
  lastVisitDate?: string
}

export interface SpeechScore {
  stars: number
  score: number
  transcript: string
  message: string
}
