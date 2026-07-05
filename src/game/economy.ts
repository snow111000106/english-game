import { characterThresholds, inventoryCatalog, lotteryPrizes, recipes } from '../data/economy'
import type { DailyMission, GameState, GardenPlot, GardenPlotKind, InventoryKey, LotteryPrize, Recipe } from '../types'

const defaultFieldCareRequirement = 2
const getFieldCareRequirement = (kind: GardenPlotKind) => (kind === 'teaLeaf' ? 1 : defaultFieldCareRequirement)

const lotteryMilkPityThreshold = 10

export const createInitialInventory = (): Record<InventoryKey, number> => ({
  sunlight: 1,
  raindrop: 1,
  chickenFeed: 1,
  strawberrySeed: 1,
  wheatSeed: 1,
  teaLeafSeed: 1,
  chicken: 1,
  strawberry: 0,
  wheat: 0,
  teaLeaf: 0,
  flour: 0,
  egg: 0,
  pearl: 0,
  tea: 0,
  milk: 0,
  strawberryBoba: 0,
  eggTart: 0,
})

export const createInitialGardenPlots = (): GardenPlot[] =>
  Array.from({ length: 5 }).map((_, index) => ({
    id: `plot-${index + 1}`,
    kind: 'empty',
    ready: false,
    sunlight: 0,
    raindrop: 0,
    fed: 0,
    chickens: 0,
    chickenEggs: [],
  }))

const addInventory = (
  inventory: Record<InventoryKey, number>,
  key: InventoryKey,
  amount: number,
) => ({
  ...inventory,
  [key]: Math.max(0, (inventory[key] ?? 0) + amount),
})

const hasInputs = (inventory: Record<InventoryKey, number>, inputs: Recipe['inputs']) =>
  Object.entries(inputs).every(([key, amount]) => inventory[key as InventoryKey] >= (amount ?? 0))

const spendInputs = (inventory: Record<InventoryKey, number>, inputs: Recipe['inputs']) =>
  Object.entries(inputs).reduce(
    (next, [key, amount]) => addInventory(next, key as InventoryKey, -(amount ?? 0)),
    inventory,
  )

const normalizeChickenEggs = (plot: GardenPlot) => {
  const chickens = Math.min(Math.max(plot.chickens ?? (plot.kind === 'chicken' ? 1 : 0), 0), 3)
  const existing = Array.isArray(plot.chickenEggs) ? plot.chickenEggs.slice(0, chickens) : []
  return Array.from({ length: chickens }).map((_, index) => Math.min(Math.max(existing[index] ?? 0, 0), 3))
}

export const migrateInventory = (state: Partial<GameState>): Record<InventoryKey, number> => {
  const initial = createInitialInventory()
  const inventory = {
    ...initial,
    ...(state.inventory ?? {}),
  }

  const ingredients = state.ingredients
  if (ingredients) {
    inventory.strawberry = Math.max(inventory.strawberry, ingredients.strawberry ?? 0)
    inventory.pearl = Math.max(inventory.pearl, ingredients.pearl ?? 0)
    inventory.tea = Math.max(inventory.tea, ingredients.tea ?? 0)
    inventory.milk = Math.max(inventory.milk, ingredients.milk ?? 0)
  }

  inventory.strawberryBoba = Math.max(inventory.strawberryBoba, state.bobaCups ?? 0)
  inventory.eggTart = Math.max(inventory.eggTart, state.eggTarts ?? 0)

  return inventory
}

export const syncLegacyIngredients = (inventory: Record<InventoryKey, number>) => ({
  strawberry: inventory.strawberry,
  pearl: inventory.pearl,
  tea: inventory.tea,
  milk: inventory.milk,
})

export const buyShopItem = (state: GameState, key: InventoryKey, cost: number): GameState => {
  if (state.starBank < cost) {
    return state
  }

  const inventory = addInventory(state.inventory, key, 1)
  return {
    ...state,
    starBank: state.starBank - cost,
    inventory,
    ingredients: syncLegacyIngredients(inventory),
  }
}

const seededRandom = (text: string) => {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value << 5) - value + text.charCodeAt(index)
    value |= 0
  }
  const normalized = Math.abs(Math.sin(value) * 10000)
  return normalized - Math.floor(normalized)
}

const pickLotteryPrize = (seed: string): LotteryPrize => {
  const totalWeight = lotteryPrizes.reduce((sum, prize) => sum + prize.weight, 0)
  let cursor = seededRandom(seed) * totalWeight
  for (const prize of lotteryPrizes) {
    cursor -= prize.weight
    if (cursor <= 0) return prize
  }
  return lotteryPrizes[0]
}

const getDrawsSinceLastMilk = (state: GameState) => {
  const milkIndex = state.lotteryHistory.findIndex((record) => record.key === 'milk')
  return milkIndex === -1 ? state.lotteryHistory.length : milkIndex
}

export const getDailyLotteryStats = (mission: DailyMission) => {
  const earnedStars = mission.tasks.reduce((sum, task) => sum + task.stars, 0)
  const availableDraws = Math.min(Math.floor(earnedStars / 10), 3)
  const claimedDraws = mission.lotteryClaimedCount ?? (mission.lotteryClaimed ? 1 : 0)
  const remainingDraws = Math.max(availableDraws - claimedDraws, 0)
  const nextTargetStars = availableDraws >= 3 ? null : (availableDraws + 1) * 10

  return {
    earnedStars,
    availableDraws,
    claimedDraws,
    remainingDraws,
    nextTargetStars,
  }
}

export const drawLottery = (state: GameState, mission: DailyMission): GameState => {
  const lotteryStats = getDailyLotteryStats(mission)
  if (lotteryStats.remainingDraws <= 0) {
    return state
  }

  const guaranteedMilk = getDrawsSinceLastMilk(state) >= lotteryMilkPityThreshold - 1
  const prize = guaranteedMilk
    ? { key: 'milk' as const, amount: 1, weight: 0 }
    : pickLotteryPrize(`${mission.date}-${lotteryStats.claimedDraws}-${state.results.length}-${state.totalStars}`)
  const createdAt = new Date().toISOString()
  let inventory = state.inventory
  let starBank = state.starBank
  let totalStars = state.totalStars
  let label = '星星'
  let emoji = '⭐'
  let amount = prize.stars ?? prize.amount ?? 1

  if (prize.key) {
    inventory = addInventory(inventory, prize.key, prize.amount ?? 1)
    const meta = inventoryCatalog[prize.key]
    label = meta.label
    emoji = meta.emoji
  }

  if (prize.stars) {
    starBank += prize.stars
    totalStars += prize.stars
    amount = prize.stars
  }

  const nextClaimedDraws = lotteryStats.claimedDraws + 1
  const nextMission = {
    ...mission,
    lotteryClaimed: nextClaimedDraws >= lotteryStats.availableDraws,
    lotteryClaimedCount: nextClaimedDraws,
  }

  return {
    ...state,
    missions: state.missions.some((item) => item.date === mission.date)
      ? state.missions.map((item) => (item.date === mission.date ? nextMission : item))
      : [...state.missions, nextMission],
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    starBank,
    totalStars,
    lotteryHistory: [
      {
        id: `lottery-${Date.now()}`,
        date: mission.date,
        label,
        key: prize.key,
        emoji,
        amount,
        stars: prize.stars,
        createdAt,
        guaranteed: guaranteedMilk,
      },
      ...state.lotteryHistory,
    ].slice(0, 30),
  }
}

export const plantInPlot = (state: GameState, plotId: string, kind: 'strawberry' | 'wheat' | 'teaLeaf' | 'chicken') => {
  const seedKey: InventoryKey = kind === 'strawberry'
    ? 'strawberrySeed'
    : kind === 'wheat'
      ? 'wheatSeed'
      : kind === 'teaLeaf'
        ? 'teaLeafSeed'
        : 'chicken'
  if (state.inventory[seedKey] <= 0) {
    return state
  }

  const plot = state.gardenPlots.find((item) => item.id === plotId)
  if (!plot) return state
  const activeChickenEggs = normalizeChickenEggs(plot).filter((eggCount) => eggCount < 3)
  if (kind === 'chicken' && plot.kind === 'chicken' && activeChickenEggs.length >= 3) {
    return state
  }
  if (kind !== 'chicken' && plot.kind !== 'empty') return state
  if (kind === 'chicken' && plot.kind !== 'empty' && plot.kind !== 'chicken') return state

  const inventory = addInventory(state.inventory, seedKey, -1)
  return {
    ...state,
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    gardenPlots: state.gardenPlots.map((item) =>
      item.id === plotId
        ? {
          ...item,
          kind,
          ready: kind === 'chicken' ? item.ready : false,
          sunlight: 0,
          raindrop: 0,
          fed: kind === 'chicken' ? item.fed : 0,
          chickens: kind === 'chicken' ? Math.min(normalizeChickenEggs(item).filter((eggCount) => eggCount < 3).length + 1, 3) : 0,
          chickenEggs: kind === 'chicken' ? [...normalizeChickenEggs(item).filter((eggCount) => eggCount < 3), 0].slice(0, 3) : [],
        }
        : item,
    ),
  }
}

export const careForPlot = (state: GameState, plotId: string, care: 'sunlight' | 'raindrop' | 'chickenFeed') => {
  const plot = state.gardenPlots.find((item) => item.id === plotId)
  if (!plot || plot.kind === 'empty' || plot.ready) return state

  const chickenEggs = plot.kind === 'chicken' ? normalizeChickenEggs(plot) : []
  if (plot.kind === 'chicken' && chickenEggs.every((eggCount) => eggCount >= 3)) return state

  const neededKey: InventoryKey = plot.kind === 'chicken' ? 'chickenFeed' : care
  if (plot.kind === 'chicken' && care !== 'chickenFeed') return state
  if (plot.kind !== 'chicken' && care === 'chickenFeed') return state
  const fieldCareRequirement = getFieldCareRequirement(plot.kind)
  if (plot.kind !== 'chicken' && care === 'sunlight' && plot.sunlight >= fieldCareRequirement) return state
  if (plot.kind !== 'chicken' && care === 'raindrop' && plot.raindrop >= fieldCareRequirement) return state
  if (state.inventory[neededKey] <= 0) {
    return state
  }

  const inventory = addInventory(state.inventory, neededKey, -1)
  const gardenPlots = state.gardenPlots.map((item) => {
    if (item.id !== plotId) return item
    if (item.kind === 'chicken') {
      const nextEggs = normalizeChickenEggs(item)
      const nextChickenIndex = nextEggs.findIndex((eggCount) => eggCount < 3)
      if (nextChickenIndex < 0) return item
      nextEggs[nextChickenIndex] += 1
      return {
        ...item,
        ready: true,
        fed: item.fed + 1,
        chickens: nextEggs.length,
        chickenEggs: nextEggs,
      }
    }

    const next = {
      ...item,
      sunlight: care === 'sunlight' ? item.sunlight + 1 : item.sunlight,
      raindrop: care === 'raindrop' ? item.raindrop + 1 : item.raindrop,
      fed: care === 'chickenFeed' ? item.fed + 1 : item.fed,
    }
    return {
      ...next,
      ready: next.kind === 'chicken' ? next.fed >= 1 : next.sunlight >= fieldCareRequirement && next.raindrop >= fieldCareRequirement,
    }
  })

  return {
    ...state,
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    gardenPlots,
  }
}

export const harvestPlot = (state: GameState, plotId: string) => {
  const plot = state.gardenPlots.find((item) => item.id === plotId)
  if (!plot || !plot.ready) return state

  const output: InventoryKey = plot.kind === 'strawberry' ? 'strawberry' : plot.kind === 'wheat' ? 'wheat' : plot.kind === 'teaLeaf' ? 'teaLeaf' : 'egg'
  const inventory = addInventory(state.inventory, output, 1)
  const emptyKind: GardenPlotKind = 'empty'
  const remainingChickenEggs = plot.kind === 'chicken' ? normalizeChickenEggs(plot).filter((eggCount) => eggCount < 3) : []
  const remainingChickens = remainingChickenEggs.length
  const nextKind: GardenPlotKind = plot.kind === 'chicken' && remainingChickens > 0 ? 'chicken' : emptyKind

  return {
    ...state,
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    gardenPlots: state.gardenPlots.map((item) =>
      item.id === plotId
        ? {
          ...item,
          kind: nextKind,
          ready: false,
          sunlight: 0,
          raindrop: 0,
          fed: 0,
          chickens: remainingChickens,
          chickenEggs: remainingChickenEggs,
        }
        : item,
    ),
  }
}

export const craftRecipe = (state: GameState, recipeId: string) => {
  const recipe = recipes.find((item) => item.id === recipeId)
  if (!recipe) return state
  if (!hasInputs(state.inventory, recipe.inputs)) {
    return state
  }

  const inventory = addInventory(spendInputs(state.inventory, recipe.inputs), recipe.output, recipe.outputAmount)
  const bobaCups = recipe.output === 'strawberryBoba' ? state.bobaCups + recipe.outputAmount : state.bobaCups
  const eggTarts = recipe.output === 'eggTart' ? state.eggTarts + recipe.outputAmount : state.eggTarts
  const treatPoints = state.treatPoints + recipe.treatPoints
  const unlockedCharacters = Array.from(
    new Set([
      ...state.unlockedCharacters,
      ...characterThresholds.filter((character) => treatPoints >= character.points).map((character) => character.id),
    ]),
  )

  return {
    ...state,
    inventory,
    ingredients: syncLegacyIngredients(inventory),
    bobaCups,
    eggTarts,
    treatPoints,
    unlockedCharacters,
  }
}

export const canCraftRecipe = (state: GameState, recipe: Recipe) => hasInputs(state.inventory, recipe.inputs)
