/**
 * 迁移脚本：把旧 game_states 表的数据拆分到分表
 * 用法：node scripts/migrate-split-tables.mjs [prod|test]
 */
import { DatabaseSync } from 'node:sqlite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const mode = process.argv[2] === 'test' ? 'test' : 'prod'
const dbPath = resolve(projectRoot, 'data', `berry-english-${mode}.sqlite`)

const db = new DatabaseSync(dbPath)

const rows = db.prepare('SELECT username, state_json AS stateJson, updated_at AS updatedAt FROM game_states').all()

console.log(`[${mode}] 找到 ${rows.length} 个用户需要迁移`)

for (const row of rows) {
  const state = JSON.parse(row.stateJson)
  const username = row.username
  const now = row.updatedAt || new Date().toISOString()

  // 拆分出各部分
  const { missions, results, lotteryHistory, ...profile } = state
  const profileJson = JSON.stringify(profile)

  db.exec('BEGIN')
  try {
    // 1. 写入 game_profiles
    db.prepare(`
      INSERT INTO game_profiles (username, profile_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
    `).run(username, profileJson, now)

    // 2. 写入 daily_missions（按 date 去重，每个日期一条）
    const missionByDate = new Map()
    for (const mission of (missions ?? [])) {
      const date = mission.date || now.slice(0, 10)
      missionByDate.set(date, mission)
    }
    for (const [date, mission] of missionByDate) {
      db.prepare(`
        INSERT INTO daily_missions (username, date, mission_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username, date) DO UPDATE SET mission_json = excluded.mission_json, updated_at = excluded.updated_at
      `).run(username, date, JSON.stringify(mission), now)
    }

    // 3. 写入 practice_results（逐条，按 createdAt 提取日期）
    let resultCount = 0
    for (const result of (results ?? [])) {
      const createdAt = result.createdAt || now
      const date = createdAt.slice(0, 10)
      const id = String(result.id || `${date}-${username}-${resultCount}`)
      db.prepare(`
        INSERT OR IGNORE INTO practice_results (id, username, date, result_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, username, date, JSON.stringify(result), createdAt)
      resultCount++
    }

    // 4. 写入 lottery_history（逐条，按 createdAt 提取日期）
    let lotteryCount = 0
    for (const record of (lotteryHistory ?? [])) {
      const createdAt = record.createdAt || now
      const date = createdAt.slice(0, 10)
      const id = String(record.id || `${date}-${username}-lottery-${lotteryCount}`)
      db.prepare(`
        INSERT OR IGNORE INTO lottery_history (id, username, date, record_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, username, date, JSON.stringify(record), createdAt)
      lotteryCount++
    }

    db.exec('COMMIT')
    console.log(`  ✓ ${username}: profile + ${missionByDate.size} missions + ${resultCount} results + ${lotteryCount} lottery`)
  } catch (error) {
    db.exec('ROLLBACK')
    console.error(`  ✗ ${username} 迁移失败:`, error.message)
  }
}

// 验证
console.log('\n迁移结果验证:')
console.log('  game_profiles:', db.prepare('SELECT count(*) AS c FROM game_profiles').get().c)
console.log('  daily_missions:', db.prepare('SELECT count(*) AS c FROM daily_missions').get().c)
console.log('  practice_results:', db.prepare('SELECT count(*) AS c FROM practice_results').get().c)
console.log('  lottery_history:', db.prepare('SELECT count(*) AS c FROM lottery_history').get().c)

db.close()
console.log(`\n[${mode}] 迁移完成`)
