import type { GameState } from '../types'
import type { LearningItem } from '../types'
import { createInitialRewards, createInitialState } from '../game/missionGenerator'
import { createInitialGardenPlots, migrateInventory, syncLegacyIngredients } from '../game/economy'
import type { GardenPlot } from '../types'

const APP_ENV = __APP_ENV__
const API_BASE = __APP_API_BASE__
const STORAGE_KEY = `berry-english-game-state-v1:${APP_ENV}`
const ACCOUNT_KEY = `berry-english-accounts-v1:${APP_ENV}`
const ACTIVE_USER_KEY = `berry-english-active-user-v1:${APP_ENV}`
const LEGACY_DB_NAMES = ['berry-english-db-prod', 'berry-english-db-test']

export type LocalAccount = {
  username: string
  password: string
  createdAt: string
}

export type LoginResult = {
  ok: boolean
  message: string
  username?: string
}

const normalizeUsername = (username: string) => username.trim().toLowerCase()

const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) throw new Error(`SQLite API 请求失败：${response.status}`)
  return response.json() as Promise<T>
}

const clearLegacyLocalStorage = () => {
  try {
    const prefixes = [
      'berry-english-game-state-v1:',
      'berry-english-accounts-v1:',
      'berry-english-active-user-v1:',
      STORAGE_KEY,
      ACCOUNT_KEY,
      ACTIVE_USER_KEY,
    ]
    Object.keys(window.localStorage)
      .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => window.localStorage.removeItem(key))
  } catch (error) {
    console.error('Failed to clear legacy localStorage', error)
  }
}

const deleteIndexedDb = (dbName: string) => {
  if (!('indexedDB' in window)) return
  const request = window.indexedDB.deleteDatabase(dbName)
  request.onerror = () => console.error(`Failed to delete legacy IndexedDB: ${dbName}`, request.error)
}

export const clearLegacyBrowserStorage = () => {
  clearLegacyLocalStorage()
  LEGACY_DB_NAMES.forEach(deleteIndexedDb)
}

const readAccounts = async (): Promise<LocalAccount[]> => {
  clearLegacyLocalStorage()
  return apiRequest<LocalAccount[]>('/api/accounts')
}

const saveAccounts = async (accounts: LocalAccount[]) => {
  clearLegacyLocalStorage()
  await apiRequest('/api/accounts', {
    method: 'PUT',
    body: JSON.stringify(accounts),
  })
}

export const getActiveUsername = () => window.sessionStorage.getItem(ACTIVE_USER_KEY) ?? ''

export const logoutAccount = () => {
  window.sessionStorage.removeItem(ACTIVE_USER_KEY)
}

export const loginOrCreateAccount = async (username: string, password: string): Promise<LoginResult> => {
  const normalizedUsername = normalizeUsername(username)
  const normalizedPassword = password.trim()
  if (!normalizedUsername || !normalizedPassword) return { ok: false, message: '请输入账号和密码。' }
  if (normalizedUsername.length < 2) return { ok: false, message: '账号至少 2 个字符。' }
  if (normalizedPassword.length < 4) return { ok: false, message: '密码至少 4 个字符。' }

  const accounts = await readAccounts()
  const existing = accounts.find((account) => account.username === normalizedUsername)
  if (existing && existing.password !== normalizedPassword) return { ok: false, message: '密码不正确，请重新输入。' }

  if (!existing) {
    await saveAccounts([...accounts, { username: normalizedUsername, password: normalizedPassword, createdAt: new Date().toISOString() }])
  } else {
    await saveAccounts(accounts)
  }

  clearLegacyLocalStorage()
  window.sessionStorage.setItem(ACTIVE_USER_KEY, normalizedUsername)
  return { ok: true, message: existing ? '登录成功。' : '账号已创建。', username: normalizedUsername }
}

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
  const chickenReady = existingPlots.some((plot) => plot.kind === 'chicken' && plot.ready)
  const chickenFed = existingPlots.reduce((sum, plot) => sum + (plot.kind === 'chicken' ? plot.fed : 0), 0)
  const chickenEggs = existingPlots
    .filter((plot) => plot.kind === 'chicken')
    .flatMap((plot) => {
      const count = Math.min(Math.max(plot.chickens ?? 1, 1), 3)
      const saved = Array.isArray(plot.chickenEggs) ? plot.chickenEggs.slice(0, count) : []
      return Array.from({ length: count }).map((_, index) => Math.min(Math.max(saved[index] ?? 0, 0), 3))
    })
    .filter((eggCount) => eggCount < 3)
    .slice(0, 3)
  const chickenCount = chickenEggs.length
  const migratedGardenPlots: GardenPlot[] = createInitialGardenPlots().map((plot, index) => {
    if (index < 4) {
      return fieldPlots[index]
        ? { ...plot, ...fieldPlots[index], id: plot.id, chickens: 0 }
        : plot
    }

    return {
      ...plot,
      kind: chickenCount > 0 ? 'chicken' : 'empty',
      ready: chickenCount > 0 && chickenReady,
      fed: chickenCount > 0 ? chickenFed : 0,
      chickens: chickenCount,
      chickenEggs,
    }
  })
  const merged: GameState = {
    ...initial,
    ...parsed,
    // 防止关键资产字段被意外置零：只在 parsed 中确实有值时覆盖
    totalStars: typeof parsed.totalStars === 'number' ? parsed.totalStars : initial.totalStars,
    starBank: typeof parsed.starBank === 'number'
      ? parsed.starBank
      : typeof parsed.totalStars === 'number' ? parsed.totalStars : 0,
    streak: typeof parsed.streak === 'number' ? parsed.streak : initial.streak,
    mastery: parsed.mastery ?? {},
    rewards: {
      ...createInitialRewards(),
      ...(parsed.rewards ?? {}),
    },
    missions: (parsed.missions ?? []).map((mission) => ({
      ...mission,
      lotteryClaimed: mission.lotteryClaimed ?? false,
      lotteryClaimedCount: mission.lotteryClaimedCount ?? (mission.lotteryClaimed ? 1 : 0),
    })),
    results: parsed.results ?? [],
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
  }

  return merged
}

export const loadGameState = async (username = getActiveUsername()): Promise<GameState> => {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) return createInitialState()

  clearLegacyLocalStorage()
  const result = await apiRequest<{ state: GameState | null }>(`/api/state/${encodeURIComponent(normalizedUsername)}`)
  return result.state ? migrateGameState(result.state) : createInitialState()
}

export const saveGameState = async (state: GameState, username = getActiveUsername()) => {
  if (!username) return
  const normalizedUsername = normalizeUsername(username)
  clearLegacyLocalStorage()
  await apiRequest(`/api/state/${encodeURIComponent(normalizedUsername)}/save`, {
    method: 'PUT',
    body: JSON.stringify(state),
  })
}

export type GameEvent = {
  type: string
  refId?: string
  deltaStars?: number
  itemKey?: string
  itemAmount?: number
  detail?: string
}

export type EventLogEntry = {
  seq: number
  username: string
  date: string
  type: string
  refId: string
  deltaStars: number
  itemKey: string
  itemAmount: number
  detail: string
  createdAt: string
}

export const logEvent = async (event: GameEvent, username = getActiveUsername()) => {
  if (!username) return
  const normalizedUsername = normalizeUsername(username)
  try {
    await apiRequest(`/api/events/${encodeURIComponent(normalizedUsername)}`, {
      method: 'POST',
      body: JSON.stringify(event),
    })
  } catch (error) {
    console.error('logEvent failed', error)
  }
}

export const getEventLog = async (username = getActiveUsername(), date?: string, type?: string): Promise<EventLogEntry[]> => {
  if (!username) return []
  const normalizedUsername = normalizeUsername(username)
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (type) params.set('type', type)
  const query = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<EventLogEntry[]>(`/api/events/${encodeURIComponent(normalizedUsername)}${query}`)
}

export const loadCurriculumFromDb = async (): Promise<LearningItem[]> => {
  try {
    return await apiRequest<LearningItem[]>('/api/curriculum')
  } catch {
    return []
  }
}

export const saveCurriculumToDb = async (items: LearningItem[]) => {
  await apiRequest('/api/curriculum', {
    method: 'PUT',
    body: JSON.stringify(items),
  })
}

export const deleteCurriculumBySource = async (source: string) => {
  await apiRequest(`/api/curriculum/${encodeURIComponent(source)}`, { method: 'DELETE' })
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

export const importGameStateFile = async (file: File, username = getActiveUsername()): Promise<GameState> => {
  const text = await file.text()
  const parsed = JSON.parse(text) as GameState
  const merged = migrateGameState(parsed)
  await saveGameState(merged, username)
  return merged
}

export const resetGameState = async (username = getActiveUsername()) => {
  const normalizedUsername = normalizeUsername(username)
  if (normalizedUsername) {
    await apiRequest(`/api/state/${encodeURIComponent(normalizedUsername)}`, { method: 'DELETE' })
  }
  clearLegacyBrowserStorage()
  return createInitialState()
}

export type SnapshotSummary = {
  date: string
  createdAt: string
  totalStars: number
  starBank: number
  inventory: Record<string, number>
  gardenPlots: string[]
  resultsCount: number
  masteryCount: number
}

export type SnapshotDetail = {
  date: string
  createdAt: string
  snapshot: Record<string, unknown>
}

export const getSnapshots = async (username = getActiveUsername()): Promise<SnapshotSummary[]> => {
  if (!username) return []
  const normalizedUsername = normalizeUsername(username)
  return apiRequest<SnapshotSummary[]>(`/api/snapshots/${encodeURIComponent(normalizedUsername)}`)
}

export const getSnapshotDetail = async (date: string, username = getActiveUsername()): Promise<SnapshotDetail> => {
  const normalizedUsername = normalizeUsername(username)
  return apiRequest<SnapshotDetail>(`/api/snapshots/${encodeURIComponent(normalizedUsername)}/${date}`)
}
