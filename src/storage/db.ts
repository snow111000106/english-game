import type { GameState } from '../types'
import { createInitialRewards, createInitialState } from '../game/missionGenerator'
import { createInitialGardenPlots, migrateInventory, syncLegacyIngredients } from '../game/economy'
import type { GardenPlot } from '../types'

const STORAGE_KEY = 'berry-english-game-state-v1'

const migrateUnlockedCharacters = (ids?: string[]) => {
  const oldToNew: Record<string, string> = {
    'berry-puff': 'round-hero',
    'pearl-mochi': 'star-knight',
    'tea-cloud': 'hammer-king',
    'milk-star': 'orange-helper',
  }
  const migrated = (ids ?? ['round-hero']).map((id) => oldToNew[id] ?? id)
  return Array.from(new Set(['round-hero', ...migrated]))
}

const migrateGameState = (parsed: Partial<GameState>): GameState => {
  const inventory = migrateInventory(parsed)
  const initial = createInitialState()
  const existingPlots = parsed.gardenPlots ?? []
  const fieldPlots = existingPlots.filter((plot) => plot.kind !== 'chicken').slice(0, 4)
  const chickenCount = Math.min(
    3,
    existingPlots.reduce((sum, plot) => sum + (plot.kind === 'chicken' ? Math.max(plot.chickens ?? 1, 1) : 0), 0),
  )
  const chickenReady = existingPlots.some((plot) => plot.kind === 'chicken' && plot.ready)
  const chickenFed = existingPlots.reduce((sum, plot) => sum + (plot.kind === 'chicken' ? plot.fed : 0), 0)
  const migratedGardenPlots: GardenPlot[] = createInitialGardenPlots().map((plot, index) => {
    if (index < 4) {
      return fieldPlots[index]
        ? { ...plot, ...fieldPlots[index], id: plot.id, chickens: 0 }
        : plot
    }

    return {
      ...plot,
      kind: chickenCount > 0 ? 'chicken' : 'empty',
      ready: chickenReady,
      fed: chickenFed,
      chickens: chickenCount,
    }
  })
  const merged: GameState = {
    ...initial,
    ...parsed,
    rewards: {
      ...createInitialRewards(),
      ...(parsed.rewards ?? {}),
    },
    missions: (parsed.missions ?? []).map((mission) => ({
      ...mission,
      lotteryClaimed: mission.lotteryClaimed ?? false,
    })),
    results: parsed.results ?? [],
    mastery: parsed.mastery ?? {},
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    gardenPlots: migratedGardenPlots,
    lotteryHistory: parsed.lotteryHistory ?? [],
    treatPoints: parsed.treatPoints ?? parsed.bobaCups ?? 0,
    eggTarts: parsed.eggTarts ?? 0,
    bobaCups: parsed.bobaCups ?? 0,
    unlockedCharacters: migrateUnlockedCharacters(parsed.unlockedCharacters),
    customCurriculum: parsed.customCurriculum ?? [],
    learnerProfile: {
      ...initial.learnerProfile,
      ...(parsed.learnerProfile ?? {}),
    },
    starBank: parsed.starBank ?? parsed.totalStars ?? 0,
  }

  return merged
}

export const loadGameState = (): GameState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as GameState

    return migrateGameState(parsed)
  } catch (error) {
    console.error('Failed to load game state', error)
    return createInitialState()
  }
}

export const saveGameState = (state: GameState) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const exportGameState = (state: GameState) => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `berry-english-backup-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export const importGameStateFile = async (file: File): Promise<GameState> => {
  const text = await file.text()
  const parsed = JSON.parse(text) as GameState
  const merged = migrateGameState(parsed)
  saveGameState(merged)
  return merged
}

export const resetGameState = () => {
  window.localStorage.removeItem(STORAGE_KEY)
  return createInitialState()
}
