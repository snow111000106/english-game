import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('data/berry-english-prod.sqlite')
const backup = new DatabaseSync('data/backups/berry-english-prod.20260703-221017.sqlite')

const row = backup.prepare('SELECT * FROM game_states WHERE username = ?').get('汪于')
const parsed = JSON.parse(row.state_json)

// 今天抽到了3颗星星和1个茶苗
const totalStars = (parsed.totalStars || 0) + 3
const starBank = (parsed.starBank || 0) + 3
const inventory = { ...parsed.inventory, teaLeafSeed: (parsed.inventory.teaLeafSeed || 0) + 1 }
const now = new Date().toISOString()

// 更新 user_stars
db.prepare('DELETE FROM user_stars WHERE username = ?').run('汪于')
db.prepare(`INSERT INTO user_stars (username, total_stars, star_bank, streak, treat_points, egg_tarts, boba_cups, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('汪于', totalStars, starBank, parsed.streak || 0, parsed.treatPoints || 0, parsed.eggTarts || 0, parsed.bobaCups || 0, now)

// 更新 game_profiles
const profile = { ...parsed, totalStars, starBank, inventory }
db.prepare('DELETE FROM game_profiles WHERE username = ?').run('汪于')
db.prepare('INSERT INTO game_profiles (username, profile_json, updated_at) VALUES (?, ?, ?)').run('汪于', JSON.stringify(profile), now)

// 更新 user_garden
db.prepare('DELETE FROM user_garden WHERE username = ?').run('汪于')
for (const plot of parsed.gardenPlots) {
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

console.log(`恢复完成: totalStars=${totalStars}, starBank=${starBank}`)
console.log(`inventory: ${JSON.stringify(inventory)}`)
console.log(`gardenPlots: ${parsed.gardenPlots.map(p => p.kind).join(', ')}`)
console.log(`mastery: ${Object.keys(parsed.mastery || {}).length} words`)

db.close()
backup.close()
