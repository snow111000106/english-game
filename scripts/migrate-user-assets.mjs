/**
 * 迁移脚本：把 game_profiles.profile_json 拆分到以用户为维度的结构化资产表
 * 用法：node scripts/migrate-user-assets.mjs [prod|test]
 *
 * 读取 game_profiles 全量 profile_json，写入：
 *   user_stars / user_inventory / user_garden / user_mastery
 *   user_rewards / user_unlocked / user_profile
 */
import { DatabaseSync } from 'node:sqlite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const mode = process.argv[2] === 'test' ? 'test' : 'prod'
const dbPath = resolve(projectRoot, 'data', `berry-english-${mode}.sqlite`)

const db = new DatabaseSync(dbPath)

// 确保表存在（与 sqlite-api.mjs 的 schema 一致）
db.exec(`
  CREATE TABLE IF NOT EXISTS user_stars (
    username TEXT PRIMARY KEY,
    total_stars INTEGER NOT NULL DEFAULT 0,
    star_bank INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    treat_points INTEGER NOT NULL DEFAULT 0,
    egg_tarts INTEGER NOT NULL DEFAULT 0,
    boba_cups INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_inventory (
    username TEXT NOT NULL,
    item_key TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, item_key)
  );
  CREATE TABLE IF NOT EXISTS user_garden (
    username TEXT NOT NULL,
    plot_id TEXT NOT NULL,
    plot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, plot_id)
  );
  CREATE TABLE IF NOT EXISTS user_mastery (
    username TEXT NOT NULL,
    item_id TEXT NOT NULL,
    mastery_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, item_id)
  );
  CREATE TABLE IF NOT EXISTS user_rewards (
    username TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    owned INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, reward_id)
  );
  CREATE TABLE IF NOT EXISTS user_unlocked (
    username TEXT NOT NULL,
    character_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (username, character_id)
  );
  CREATE TABLE IF NOT EXISTS user_profile (
    username TEXT PRIMARY KEY,
    age INTEGER NOT NULL DEFAULT 6,
    level TEXT NOT NULL DEFAULT 'pre-a1',
    focus_themes TEXT NOT NULL DEFAULT '',
    last_visit_date TEXT,
    updated_at TEXT NOT NULL
  );
`)

const rows = db.prepare('SELECT username, profile_json AS profileJson, updated_at AS updatedAt FROM game_profiles').all()

console.log(`[${mode}] 找到 ${rows.length} 个用户需要迁移资产数据`)

let totalUsers = 0
let totalInventory = 0
let totalGarden = 0
let totalMastery = 0
let totalRewards = 0
let totalUnlocked = 0

for (const row of rows) {
  const profile = JSON.parse(row.profileJson)
  const username = row.username
  const now = row.updatedAt || new Date().toISOString()

  db.exec('BEGIN')
  try {
    // 1. user_stars
    db.prepare(`
      INSERT INTO user_stars (username, total_stars, star_bank, streak, treat_points, egg_tarts, boba_cups, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        total_stars = excluded.total_stars, star_bank = excluded.star_bank,
        streak = excluded.streak, treat_points = excluded.treat_points,
        egg_tarts = excluded.egg_tarts, boba_cups = excluded.boba_cups,
        updated_at = excluded.updated_at
    `).run(
      username,
      profile.totalStars ?? 0,
      profile.starBank ?? 0,
      profile.streak ?? 0,
      profile.treatPoints ?? 0,
      profile.eggTarts ?? 0,
      profile.bobaCups ?? 0,
      now,
    )

    // 2. user_inventory（道具 + 原料）
    db.prepare('DELETE FROM user_inventory WHERE username = ?').run(username)
    const invStmt = db.prepare('INSERT INTO user_inventory (username, item_key, amount, updated_at) VALUES (?, ?, ?, ?)')
    let invCount = 0
    for (const [key, amount] of Object.entries(profile.inventory ?? {})) {
      if ((amount ?? 0) !== 0) {
        invStmt.run(username, key, amount, now)
        invCount++
      }
    }
    for (const [key, amount] of Object.entries(profile.ingredients ?? {})) {
      if ((amount ?? 0) !== 0) {
        invStmt.run(username, `ingredient_${key}`, amount, now)
        invCount++
      }
    }
    totalInventory += invCount

    // 3. user_garden
    db.prepare('DELETE FROM user_garden WHERE username = ?').run(username)
    const gardenStmt = db.prepare('INSERT INTO user_garden (username, plot_id, plot_json, updated_at) VALUES (?, ?, ?, ?)')
    let gardenCount = 0
    for (const plot of (profile.gardenPlots ?? [])) {
      gardenStmt.run(username, String(plot.id ?? ''), JSON.stringify(plot), now)
      gardenCount++
    }
    totalGarden += gardenCount

    // 4. user_mastery
    db.prepare('DELETE FROM user_mastery WHERE username = ?').run(username)
    const masteryStmt = db.prepare('INSERT INTO user_mastery (username, item_id, mastery_json, updated_at) VALUES (?, ?, ?, ?)')
    let masteryCount = 0
    for (const [itemId, record] of Object.entries(profile.mastery ?? {})) {
      masteryStmt.run(username, itemId, JSON.stringify(record), now)
      masteryCount++
    }
    totalMastery += masteryCount

    // 5. user_rewards
    db.prepare('DELETE FROM user_rewards WHERE username = ?').run(username)
    const rewardStmt = db.prepare('INSERT INTO user_rewards (username, reward_id, owned, updated_at) VALUES (?, ?, ?, ?)')
    let rewardCount = 0
    for (const [rewardId, reward] of Object.entries(profile.rewards ?? {})) {
      rewardStmt.run(username, rewardId, reward?.owned ? 1 : 0, now)
      rewardCount++
    }
    totalRewards += rewardCount

    // 6. user_unlocked
    db.prepare('DELETE FROM user_unlocked WHERE username = ?').run(username)
    const unlockStmt = db.prepare('INSERT INTO user_unlocked (username, character_id, unlocked_at) VALUES (?, ?, ?)')
    let unlockCount = 0
    for (const charId of (profile.unlockedCharacters ?? [])) {
      unlockStmt.run(username, String(charId), now)
      unlockCount++
    }
    totalUnlocked += unlockCount

    // 7. user_profile
    const lp = profile.learnerProfile ?? {}
    const focusThemes = Array.isArray(lp.focusThemes) ? lp.focusThemes.join(',') : ''
    db.prepare(`
      INSERT INTO user_profile (username, age, level, focus_themes, last_visit_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        age = excluded.age, level = excluded.level, focus_themes = excluded.focus_themes,
        last_visit_date = excluded.last_visit_date, updated_at = excluded.updated_at
    `).run(username, lp.age ?? 6, lp.level ?? 'pre-a1', focusThemes, profile.lastVisitDate ?? null, now)

    db.exec('COMMIT')
    totalUsers++
    console.log(`  ✓ ${username}: stars=${profile.starBank ?? 0} inv=${invCount} garden=${gardenCount} mastery=${masteryCount} rewards=${rewardCount} unlocked=${unlockCount}`)
  } catch (error) {
    db.exec('ROLLBACK')
    console.error(`  ✗ ${username} 迁移失败:`, error.message)
  }
}

// 验证
console.log('\n迁移结果验证:')
console.log(`  用户数: ${totalUsers}`)
console.log('  user_stars:', db.prepare('SELECT count(*) AS c FROM user_stars').get().c)
console.log('  user_inventory:', db.prepare('SELECT count(*) AS c FROM user_inventory').get().c)
console.log('  user_garden:', db.prepare('SELECT count(*) AS c FROM user_garden').get().c)
console.log('  user_mastery:', db.prepare('SELECT count(*) AS c FROM user_mastery').get().c)
console.log('  user_rewards:', db.prepare('SELECT count(*) AS c FROM user_rewards').get().c)
console.log('  user_unlocked:', db.prepare('SELECT count(*) AS c FROM user_unlocked').get().c)
console.log('  user_profile:', db.prepare('SELECT count(*) AS c FROM user_profile').get().c)

console.log(`\n✓ [${mode}] 资产数据迁移完成`)
db.close()
