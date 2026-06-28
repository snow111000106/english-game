import { characterThresholds, inventoryCatalog, lotteryPrizes, recipes } from '../data/economy'
import type { DailyMission, GameState, GardenPlot, GardenPlotKind, InventoryKey, LotteryPrize, Recipe } from '../types'

export const createInitialInventory = (): Record<InventoryKey, number> => ({
  sunlight: 0,
  raindrop: 0,
  chickenFeed: 0,
  strawberrySeed: 1,
  wheatSeed: 1,
  chicken: 1,
  strawberry: 0,
  wheat: 0,
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

export const drawLottery = (state: GameState, mission: DailyMission): GameState => {
  if (!mission.completed) {
    return state
  }
  if (mission.lotteryClaimed) {
    return state
  }

  const prize = pickLotteryPrize(`${mission.date}-${state.results.length}-${state.totalStars}`)
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

  const nextMission = { ...mission, lotteryClaimed: true }

  return {
    ...state,
    missions: state.missions.map((item) => (item.date === mission.date ? nextMission : item)),
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
      },
      ...state.lotteryHistory,
    ].slice(0, 30),
  }
}

export const plantInPlot = (state: GameState, plotId: string, kind: 'strawberry' | 'wheat' | 'chicken') => {
  const seedKey: InventoryKey = kind === 'strawberry' ? 'strawberrySeed' : kind === 'wheat' ? 'wheatSeed' : 'chicken'
  if (state.inventory[seedKey] <= 0) {
    return state
  }

  const plot = state.gardenPlots.find((item) => item.id === plotId)
  if (!plot) return state
  if (kind === 'chicken' && plot.kind === 'chicken' && (plot.chickens ?? 1) >= 3) {
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
          chickens: kind === 'chicken' ? (item.chickens ?? 0) + 1 : 0,
        }
        : item,
    ),
  }
}

export const careForPlot = (state: GameState, plotId: string, care: 'sunlight' | 'raindrop' | 'chickenFeed') => {
  const plot = state.gardenPlots.find((item) => item.id === plotId)
  if (!plot || plot.kind === 'empty' || plot.ready) return state

  const neededKey: InventoryKey = plot.kind === 'chicken' ? 'chickenFeed' : care
  if (plot.kind === 'chicken' && care !== 'chickenFeed') return state
  if (plot.kind !== 'chicken' && care === 'chickenFeed') return state
  if (state.inventory[neededKey] <= 0) {
    return state
  }

  const inventory = addInventory(state.inventory, neededKey, -1)
  const gardenPlots = state.gardenPlots.map((item) => {
    if (item.id !== plotId) return item
    const next = {
      ...item,
      sunlight: care === 'sunlight' ? item.sunlight + 1 : item.sunlight,
      raindrop: care === 'raindrop' ? item.raindrop + 1 : item.raindrop,
      fed: care === 'chickenFeed' ? item.fed + 1 : item.fed,
    }
    return {
      ...next,
      ready: next.kind === 'chicken' ? next.fed >= 1 : next.sunlight >= 1 && next.raindrop >= 1,
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

  const output: InventoryKey = plot.kind === 'strawberry' ? 'strawberry' : plot.kind === 'wheat' ? 'wheat' : 'egg'
  const inventory = addInventory(state.inventory, output, 1)
  const emptyKind: GardenPlotKind = 'empty'
  const remainingChickens = plot.kind === 'chicken' ? Math.max(plot.chickens ?? 1, 1) : 0
  const nextKind: GardenPlotKind = plot.kind === 'chicken' ? 'chicken' : emptyKind

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
