import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('data/berry-english-prod.sqlite')
const backup = new DatabaseSync('data/backups/berry-english-prod.20260703-221017.sqlite')

const row = backup.prepare('SELECT * FROM game_states WHERE username = ?').get('汪于')
const parsed = JSON.parse(row.state_json)

// 备份基础数据
// inventory: strawberry:2, teaLeaf:1, egg:2, teaLeafSeed:0
// totalStars:27, starBank:0

// 今天流水:
// harvest: teaLeaf×3, wheat×1
// shop_buy: teaLeafSeed×3, sunlight×5, raindrop×4
// lottery: teaLeafSeed×1, stars×3
// craft: flour×1(消耗wheat×1), pearl×1(消耗flour×1)
// practice_stars: +27
// shop_buy 花费: -26 stars
// 种植消耗: teaLeafSeed×1 (种plot-4茶地)

const totalStars = 27 + 27 - 26 + 3 // = 31 (27练习 + 3抽奖 - 26兑换 + 备份27)
const starBank = 0 + 27 - 26 + 3 // = 4

// 不对，totalStars 是累计星星，不应该减去兑换花费
// totalStars = 备份27 + 今天练习获得27 + 今天抽奖3 = 57
// starBank = 备份0 + 今天练习获得27 + 今天抽奖3 - 兑换花费26 = 4

const correctTotalStars = 27 + 27 + 3 // 57
const correctStarBank = 0 + 27 + 3 - 26 // 4

const inventory = {
  sunlight: 0 + 5,      // +5 兑换
  raindrop: 0 + 4,      // +4 兑换
  chickenFeed: 0,
  strawberrySeed: 0,
  wheatSeed: 0,
  teaLeafSeed: 0 + 3 + 1 - 1, // +3兑换 +1抽奖 -1种植 = 3
  chicken: 0,
  strawberry: 2,         // 不变
  wheat: 0 + 1 - 1,     // +1收获 -1做面粉 = 0
  teaLeaf: 1 + 3,        // +3收获 = 4
  flour: 0 + 1 - 1,     // +1做面粉 -1做珍珠 = 0
  egg: 2,                // 不变
  pearl: 0 + 1,          // +1做珍珠
  tea: 0,
  milk: 0,
  strawberryBoba: 0,
  eggTart: 0,
}

// 花园: 备份状态 + 今天新种plot-4茶地
const gardenPlots = [...parsed.gardenPlots]
const plot4 = gardenPlots.find(p => p.id === 'plot-4')
if (plot4) {
  plot4.kind = 'teaLeaf'
  plot4.ready = false
  plot4.sunlight = 0
  plot4.raindrop = 0
}

const now = new Date().toISOString()

// 更新 user_stars
db.prepare('DELETE FROM user_stars WHERE username = ?').run('汪于')
db.prepare(`INSERT INTO user_stars (username, total_stars, star_bank, streak, treat_points, egg_tarts, boba_cups, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('汪于', correctTotalStars, correctStarBank, parsed.streak || 0, parsed.treatPoints || 0, parsed.eggTarts || 0, parsed.bobaCups || 0, now)

// 更新 game_profiles
const profile = { ...parsed, totalStars: correctTotalStars, starBank: correctStarBank, inventory, gardenPlots }
db.prepare('DELETE FROM game_profiles WHERE username = ?').run('汪于')
db.prepare('INSERT INTO game_profiles (username, profile_json, updated_at) VALUES (?, ?, ?)').run('汪于', JSON.stringify(profile), now)

// 更新 user_garden
db.prepare('DELETE FROM user_garden WHERE username = ?').run('汪于')
for (const plot of gardenPlots) {
  db.prepare('INSERT INTO user_garden (username, plot_id, plot_json, updated_at) VALUES (?, ?, ?, ?)').run('汪于', plot.id, JSON.stringify(plot), now)
}

// 更新 user_inventory
db.prepare('DELETE FROM user_inventory WHERE username = ?').run('汪于')
for (const [key, amount] of Object.entries(inventory)) {
  if (amount > 0) {
    db.prepare('INSERT INTO user_inventory (username, item_key, amount, updated_at) VALUES (?, ?, ?, ?)').run('汪于', key, amount, now)
  }
}

// 更新 user_mastery
db.prepare('DELETE FROM user_mastery WHERE username = ?').run('汪于')
for (const [itemId, record] of Object.entries(parsed.mastery || {})) {
  db.prepare('INSERT INTO user_mastery (username, item_id, mastery_json, updated_at) VALUES (?, ?, ?, ?)').run('汪于', itemId, JSON.stringify(record), now)
}

// 更新 user_rewards
db.prepare('DELETE FROM user_rewards WHERE username = ?').run('汪于')
for (const reward of Object.values(parsed.rewards || {})) {
  db.prepare('INSERT INTO user_rewards (username, reward_id, owned, updated_at) VALUES (?, ?, ?, ?)').run('汪于', reward.id, reward.owned || 0, now)
}

// 更新 user_unlocked
db.prepare('DELETE FROM user_unlocked WHERE username = ?').run('汪于')
for (const charId of (parsed.unlockedCharacters || ['round-hero'])) {
  db.prepare('INSERT INTO user_unlocked (username, character_id, unlocked_at) VALUES (?, ?, ?)').run('汪于', charId, now)
}

console.log(`恢复完成:`)
console.log(`  totalStars: ${correctTotalStars}`)
console.log(`  starBank: ${correctStarBank}`)
console.log(`  inventory: ${JSON.stringify(inventory)}`)
console.log(`  gardenPlots: ${gardenPlots.map(p => p.kind).join(', ')}`)
console.log(`  mastery: ${Object.keys(parsed.mastery || {}).length} words`)

db.close()
backup.close()
