import type { InventoryKey, LotteryPrize, Recipe, ShopItem } from '../types'

export const inventoryCatalog: Record<InventoryKey, { label: string; emoji: string; group: string; iconSrc?: string; source: string }> = {
  sunlight: { label: '阳光', emoji: '☀️', group: '养成资源', iconSrc: '/items/阳光.png', source: '星星兑换 · 花园天气' },
  raindrop: { label: '雨露', emoji: '💧', group: '养成资源', iconSrc: '/items/雨露.png', source: '星星兑换 · 花园天气' },
  chickenFeed: { label: '鸡食料', emoji: '🌽', group: '养成资源', iconSrc: '/items/鸡饲料.png', source: '星星兑换 · 抽奖' },
  strawberrySeed: { label: '草莓种子', emoji: '🌱', group: '种子', iconSrc: '/items/草莓种子.png', source: '星星兑换 · 抽奖' },
  wheatSeed: { label: '小麦种子', emoji: '🌾', group: '种子', iconSrc: '/items/小麦种子.png', source: '星星兑换 · 抽奖' },
  teaLeafSeed: { label: '茶苗', emoji: '🍃', group: '种子', iconSrc: '/items/茶苗.png', source: '星星兑换 · 抽奖' },
  chicken: { label: '小鸡', emoji: '🐥', group: '动物', iconSrc: '/items/小鸡.png', source: '星星兑换 · 抽奖稀有' },
  strawberry: { label: '草莓', emoji: '🍓', group: '农作物', iconSrc: '/items/草莓.png', source: '花园种植收获 · 兑换' },
  wheat: { label: '小麦', emoji: '🌾', group: '农作物', iconSrc: '/items/小麦.png', source: '花园种植收获' },
  teaLeaf: { label: '茶叶', emoji: '🍃', group: '农作物', iconSrc: '/items/茶叶.png', source: '花园种植收获' },
  flour: { label: '面粉', emoji: '🥣', group: '加工品', iconSrc: '/items/面粉.png', source: '工厂磨面粉（小麦→面粉）' },
  egg: { label: '鸡蛋', emoji: '🥚', group: '动物产物', iconSrc: '/items/鸡蛋.png', source: '小鸡产出 · 抽奖' },
  pearl: { label: '珍珠', emoji: '⚪', group: '工厂材料', iconSrc: '/items/珍珠.png', source: '工厂搓珍珠（面粉→珍珠）· 抽奖' },
  tea: { label: '茶底', emoji: '🍵', group: '工厂材料', iconSrc: '/items/茶底.png', source: '工厂熬茶底（茶叶→茶底）· 抽奖' },
  milk: { label: '牛奶', emoji: '🥛', group: '工厂材料', iconSrc: '/items/牛奶.png', source: '抽奖保底' },
  strawberryBoba: { label: '草莓啵啵', emoji: '🧋', group: '高级道具', iconSrc: '/items/草莓啵啵奶茶.png', source: '工厂制作（草莓+珍珠+茶底+牛奶）' },
  eggTart: { label: '蛋挞', emoji: '🥧', group: '高级道具', iconSrc: '/items/蛋挞.png', source: '工厂制作（鸡蛋+面粉+牛奶）' },
}

export const shopItems: ShopItem[] = [
  { key: 'sunlight', cost: 2, featured: true },
  { key: 'raindrop', cost: 2, featured: true },
  { key: 'chickenFeed', cost: 3, featured: true },
  { key: 'wheatSeed', cost: 3 },
  { key: 'strawberrySeed', cost: 4 },
  { key: 'teaLeafSeed', cost: 4 },
  { key: 'chicken', cost: 20 },
  { key: 'strawberry', cost: 12, shortcut: true },
]

export const lotteryPrizes: LotteryPrize[] = [
  { key: 'strawberrySeed', amount: 1, weight: 20 },
  { key: 'wheatSeed', amount: 1, weight: 17 },
  { key: 'teaLeafSeed', amount: 1, weight: 11 },
  { key: 'sunlight', amount: 1, weight: 16 },
  { key: 'raindrop', amount: 1, weight: 16 },
  { key: 'chickenFeed', amount: 1, weight: 8 },
  { key: 'pearl', amount: 1, weight: 5 },
  { key: 'tea', amount: 1, weight: 4 },
  { key: 'milk', amount: 1, weight: 2 },
  { key: 'chicken', amount: 1, weight: 1 },
  { stars: 3, weight: 2 },
]

export const recipes: Recipe[] = [
  {
    id: 'flour',
    name: '磨面粉',
    emoji: '🥣',
    output: 'flour',
    outputAmount: 1,
    inputs: { wheat: 1 },
    treatPoints: 0,
    description: '把 1 个小麦磨成 1 份面粉。',
  },
  {
    id: 'pearl',
    name: '搓珍珠',
    emoji: '⚪',
    output: 'pearl',
    outputAmount: 1,
    inputs: { flour: 1 },
    treatPoints: 0,
    description: '把 1 份面粉搓成 1 颗珍珠。',
  },
  {
    id: 'tea-base',
    name: '熬茶底',
    emoji: '🍵',
    output: 'tea',
    outputAmount: 1,
    inputs: { teaLeaf: 5 },
    treatPoints: 0,
    description: '把 5 片茶叶熬成 1 份茶底。',
  },
  {
    id: 'strawberry-boba',
    name: '草莓啵啵',
    emoji: '🧋',
    output: 'strawberryBoba',
    outputAmount: 1,
    inputs: { strawberry: 2, pearl: 1, tea: 1, milk: 1 },
    treatPoints: 1,
    description: '草莓 2 + 珍珠 1 + 茶底 1 + 牛奶 1。',
  },
  {
    id: 'egg-tart',
    name: '蛋挞',
    emoji: '🥧',
    output: 'eggTart',
    outputAmount: 1,
    inputs: { egg: 2, flour: 1, milk: 1 },
    treatPoints: 1,
    description: '鸡蛋 2 + 面粉 1 + 牛奶 1。',
  },
]

export const characterThresholds = [
  { id: 'round-hero', points: 0 },
  { id: 'star-knight', points: 10 },
  { id: 'hammer-king', points: 20 },
  { id: 'orange-helper', points: 30 },
]
