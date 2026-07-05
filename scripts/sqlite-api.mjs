import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const mode = process.argv[2] === 'test' ? 'test' : 'prod'
const defaultPort = mode === 'test' ? 6174 : 6173
const port = Number(process.env.API_PORT ?? process.argv[3] ?? defaultPort)
const dbDir = resolve(projectRoot, 'data')
const dbPath = resolve(dbDir, `berry-english-${mode}.sqlite`)

mkdirSync(dbDir, { recursive: true })

const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_profiles (
    username TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_missions (
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    mission_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, date)
  );
  CREATE TABLE IF NOT EXISTS practice_results (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_practice_user_date ON practice_results (username, date);
  CREATE TABLE IF NOT EXISTS lottery_history (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    record_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lottery_user_date ON lottery_history (username, date);
  CREATE TABLE IF NOT EXISTS event_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    ref_id TEXT,
    delta_stars INTEGER DEFAULT 0,
    item_key TEXT,
    item_amount INTEGER DEFAULT 0,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_user_date ON event_log (username, date);
  CREATE INDEX IF NOT EXISTS idx_event_user_type ON event_log (username, type);
  CREATE TABLE IF NOT EXISTS curriculum_items (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    theme TEXT NOT NULL,
    unit TEXT NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    meaning TEXT NOT NULL,
    emoji TEXT NOT NULL,
    prompt TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    age_range_json TEXT NOT NULL,
    difficulty INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    source TEXT NOT NULL,
    review_interval_days INTEGER NOT NULL,
    audio_src TEXT,
    image_src TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_source ON curriculum_items (source);
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
  CREATE TABLE IF NOT EXISTS game_states (
    username TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_snapshots (
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (username, date)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshot_user_date ON daily_snapshots (username, date);
`)

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const normalizeUsername = (username) => username.trim().toLowerCase()

const sendJson = (response, status, data) => {
  response.writeHead(status, jsonHeaders)
  response.end(JSON.stringify(data))
}

const readBody = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (!chunks.length) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (request, response) => {
  if (!request.url) return sendJson(response, 400, { error: 'Bad request' })
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})

  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`)
  const parts = url.pathname.split('/').filter(Boolean)

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, env: mode, dbPath })
    }

    if (parts[0] === 'api' && parts[1] === 'accounts') {
      if (request.method === 'GET' && parts.length === 2) {
        const rows = db.prepare('SELECT username, password, created_at AS createdAt FROM accounts ORDER BY username').all()
        return sendJson(response, 200, rows)
      }

      if (request.method === 'PUT' && parts.length === 2) {
        const accounts = await readBody(request)
        if (!Array.isArray(accounts)) return sendJson(response, 400, { error: 'Accounts must be an array' })

        const upsert = db.prepare(`
          INSERT INTO accounts (username, password, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET password = excluded.password, created_at = excluded.created_at
        `)
        db.exec('BEGIN')
        try {
          for (const account of accounts) {
            const username = normalizeUsername(String(account.username ?? ''))
            const password = String(account.password ?? '').trim()
            const createdAt = String(account.createdAt ?? new Date().toISOString())
            if (username && password) upsert.run(username, password, createdAt)
          }
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
        return sendJson(response, 200, { ok: true })
      }
    }

    if (parts[0] === 'api' && parts[1] === 'state' && parts[2] && parts.length === 3) {
      const username = normalizeUsername(decodeURIComponent(parts[2]))
      if (!username) return sendJson(response, 400, { error: 'Username is required' })

      if (request.method === 'GET') {
        // 优先从分表合并返回
        const profileRow = db.prepare('SELECT profile_json AS profileJson FROM game_profiles WHERE username = ?').get(username)
        const missionRows = db.prepare('SELECT mission_json AS missionJson FROM daily_missions WHERE username = ? ORDER BY date').all(username)
        const resultRows = db.prepare('SELECT result_json AS resultJson FROM practice_results WHERE username = ?').all(username)
        const lotteryRows = db.prepare('SELECT record_json AS recordJson FROM lottery_history WHERE username = ? ORDER BY created_at').all(username)

        if (profileRow || missionRows.length || resultRows.length || lotteryRows.length) {
          const profile = profileRow ? JSON.parse(profileRow.profileJson) : {}
          const missions = missionRows.map((row) => JSON.parse(row.missionJson))
          const results = resultRows.map((row) => JSON.parse(row.resultJson))
          const lotteryHistory = lotteryRows.map((row) => JSON.parse(row.recordJson))
          return sendJson(response, 200, { state: { ...profile, missions, results, lotteryHistory } })
        }

        // 回退：旧表
        const legacyRow = db.prepare('SELECT state_json AS stateJson FROM game_states WHERE username = ?').get(username)
        return sendJson(response, 200, { state: legacyRow ? JSON.parse(legacyRow.stateJson) : null })
      }

      if (request.method === 'DELETE') {
        db.exec('BEGIN')
        try {
          db.prepare('DELETE FROM game_profiles WHERE username = ?').run(username)
          db.prepare('DELETE FROM daily_missions WHERE username = ?').run(username)
          db.prepare('DELETE FROM practice_results WHERE username = ?').run(username)
          db.prepare('DELETE FROM lottery_history WHERE username = ?').run(username)
          db.prepare('DELETE FROM event_log WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_stars WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_inventory WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_garden WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_mastery WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_rewards WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_unlocked WHERE username = ?').run(username)
          db.prepare('DELETE FROM user_profile WHERE username = ?').run(username)
          db.prepare('DELETE FROM game_states WHERE username = ?').run(username)
          db.prepare('DELETE FROM daily_snapshots WHERE username = ?').run(username)
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
        return sendJson(response, 200, { ok: true })
      }
    }

    // ─── 分表保存：profile + 当天 mission + 当天 results + 当天 lottery ───
    if (parts[0] === 'api' && parts[1] === 'state' && parts[2] && parts[3] === 'save' && parts.length === 4) {
      if (request.method !== 'PUT') return sendJson(response, 405, { error: 'Method not allowed' })
      const username = normalizeUsername(decodeURIComponent(parts[2]))
      if (!username) return sendJson(response, 400, { error: 'Username is required' })

      const body = await readBody(request)
      const now = new Date().toISOString()
      const today = now.slice(0, 10)

      // 拆分出 profile 部分（不含 missions/results/lotteryHistory）
      const { missions, results, lotteryHistory, ...profile } = body
      const profileJson = JSON.stringify(profile)

      // 拆分出当天数据
      const todayMissions = (missions ?? []).filter((m) => m.date === today)
      const todayResults = (results ?? []).filter((r) => (r.createdAt ?? '').slice(0, 10) === today)
      const todayLottery = (lotteryHistory ?? []).filter((r) => (r.createdAt ?? '').slice(0, 10) === today)

      db.exec('BEGIN')
      try {
        // 1. 保存 profile（upsert）
        db.prepare(`
          INSERT INTO game_profiles (username, profile_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at
        `).run(username, profileJson, now)

        // 2. 保存当天 mission（upsert）
        for (const mission of todayMissions) {
          db.prepare(`
            INSERT INTO daily_missions (username, date, mission_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username, date) DO UPDATE SET mission_json = excluded.mission_json, updated_at = excluded.updated_at
          `).run(username, mission.date, JSON.stringify(mission), now)
        }

        // 3. 保存当天 practice_results（INSERT OR IGNORE，只增不删）
        for (const result of todayResults) {
          const id = String(result.id ?? `${today}-${Math.random().toString(36).slice(2)}`)
          db.prepare(`
            INSERT OR IGNORE INTO practice_results (id, username, date, result_json, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, username, today, JSON.stringify(result), result.createdAt ?? now)
        }

        // 4. 保存当天 lottery_history（INSERT OR IGNORE，只增不删）
        for (const record of todayLottery) {
          const id = String(record.id ?? `${today}-lottery-${Math.random().toString(36).slice(2)}`)
          db.prepare(`
            INSERT OR IGNORE INTO lottery_history (id, username, date, record_json, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, username, today, JSON.stringify(record), record.createdAt ?? now)
        }

        // 5. 写入结构化资产表（以用户为维度）
        // 5a. 星星 & 统计类资产
        db.prepare(`
          INSERT INTO user_stars (username, total_stars, star_bank, streak, treat_points, egg_tarts, boba_cups, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            total_stars = excluded.total_stars,
            star_bank = excluded.star_bank,
            streak = excluded.streak,
            treat_points = excluded.treat_points,
            egg_tarts = excluded.egg_tarts,
            boba_cups = excluded.boba_cups,
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

        // 5b. 仓库道具（全量覆盖）
        const inventory = profile.inventory ?? {}
        // 先删再插（全量同步）
        db.prepare('DELETE FROM user_inventory WHERE username = ?').run(username)
        const invStmt = db.prepare(`
          INSERT INTO user_inventory (username, item_key, amount, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        for (const [key, amount] of Object.entries(inventory)) {
          if ((amount ?? 0) !== 0) {
            invStmt.run(username, key, amount, now)
          }
        }

        // 5c. 花园地块（全量覆盖）
        const gardenPlots = profile.gardenPlots ?? []
        db.prepare('DELETE FROM user_garden WHERE username = ?').run(username)
        const gardenStmt = db.prepare(`
          INSERT INTO user_garden (username, plot_id, plot_json, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        for (const plot of gardenPlots) {
          gardenStmt.run(username, String(plot.id ?? ''), JSON.stringify(plot), now)
        }

        // 5d. 技能掌握度（全量覆盖）
        const mastery = profile.mastery ?? {}
        db.prepare('DELETE FROM user_mastery WHERE username = ?').run(username)
        const masteryStmt = db.prepare(`
          INSERT INTO user_mastery (username, item_id, mastery_json, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        for (const [itemId, record] of Object.entries(mastery)) {
          masteryStmt.run(username, itemId, JSON.stringify(record), now)
        }

        // 5e. 奖励解锁（全量覆盖）
        const rewards = profile.rewards ?? {}
        db.prepare('DELETE FROM user_rewards WHERE username = ?').run(username)
        const rewardStmt = db.prepare(`
          INSERT INTO user_rewards (username, reward_id, owned, updated_at)
          VALUES (?, ?, ?, ?)
        `)
        for (const [rewardId, reward] of Object.entries(rewards)) {
          rewardStmt.run(username, rewardId, reward?.owned ? 1 : 0, now)
        }

        // 5f. 解锁角色（全量覆盖）
        const unlockedCharacters = profile.unlockedCharacters ?? []
        db.prepare('DELETE FROM user_unlocked WHERE username = ?').run(username)
        const unlockStmt = db.prepare(`
          INSERT INTO user_unlocked (username, character_id, unlocked_at)
          VALUES (?, ?, ?)
        `)
        for (const charId of unlockedCharacters) {
          unlockStmt.run(username, String(charId), now)
        }

        // 5g. 学习者档案
        const lp = profile.learnerProfile ?? {}
        const focusThemes = Array.isArray(lp.focusThemes) ? lp.focusThemes.join(',') : ''
        db.prepare(`
          INSERT INTO user_profile (username, age, level, focus_themes, last_visit_date, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            age = excluded.age,
            level = excluded.level,
            focus_themes = excluded.focus_themes,
            last_visit_date = excluded.last_visit_date,
            updated_at = excluded.updated_at
        `).run(username, lp.age ?? 6, lp.level ?? 'pre-a1', focusThemes, profile.lastVisitDate ?? null, now)

        // 6. 同步旧表（兼容回退）
        db.prepare(`
          INSERT INTO game_states (username, state_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
        `).run(username, JSON.stringify({ ...profile, missions: missions ?? [], results: results ?? [], lotteryHistory: lotteryHistory ?? [] }), now)

        // 6b. 写入每日快照（当天 upsert，保留每天最新状态）
        const snapshotJson = JSON.stringify({
          totalStars: profile.totalStars ?? 0,
          starBank: profile.starBank ?? 0,
          streak: profile.streak ?? 0,
          treatPoints: profile.treatPoints ?? 0,
          eggTarts: profile.eggTarts ?? 0,
          bobaCups: profile.bobaCups ?? 0,
          inventory: profile.inventory ?? {},
          gardenPlots: profile.gardenPlots ?? [],
          mastery: profile.mastery ?? {},
          rewards: profile.rewards ?? {},
          unlockedCharacters: profile.unlockedCharacters ?? [],
          learnerProfile: profile.learnerProfile ?? {},
          lastVisitDate: profile.lastVisitDate ?? null,
          resultsCount: (results ?? []).length,
          lotteryCount: (lotteryHistory ?? []).length,
          masteryCount: Object.keys(profile.mastery ?? {}).length,
        })
        db.prepare(`
          INSERT INTO daily_snapshots (username, date, snapshot_json, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(username, date) DO UPDATE SET snapshot_json = excluded.snapshot_json, created_at = excluded.created_at
        `).run(username, today, snapshotJson, now)

        // 6c. 清理超过 90 天的旧快照
        db.prepare('DELETE FROM daily_snapshots WHERE username = ? AND date < ?').run(username, today.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => {
          const dt = new Date(Number(y), Number(m) - 1, Number(d))
          dt.setDate(dt.getDate() - 90)
          return dt.toISOString().slice(0, 10)
        }))

        // 7. 同步 ingredients 到 user_inventory（以 ingredient_ 前缀）
        const ingredients = profile.ingredients ?? {}
        const ingStmt = db.prepare(`
          INSERT INTO user_inventory (username, item_key, amount, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(username, item_key) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at
        `)
        for (const [key, amount] of Object.entries(ingredients)) {
          if ((amount ?? 0) !== 0) {
            ingStmt.run(username, `ingredient_${key}`, amount, now)
          }
        }

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return sendJson(response, 200, { ok: true })
    }

    // ─── 事件流水 ───
    if (parts[0] === 'api' && parts[1] === 'events' && parts[2] && parts.length === 3) {
      const username = normalizeUsername(decodeURIComponent(parts[2]))
      if (!username) return sendJson(response, 400, { error: 'Username is required' })

      if (request.method === 'POST') {
        const event = await readBody(request)
        if (!event || !event.type) return sendJson(response, 400, { error: 'Event type is required' })
        const now = new Date().toISOString()
        const date = now.slice(0, 10)
        db.prepare(`
          INSERT INTO event_log (username, date, type, ref_id, delta_stars, item_key, item_amount, detail, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          username,
          date,
          String(event.type),
          String(event.refId ?? ''),
          Number(event.deltaStars ?? 0),
          String(event.itemKey ?? ''),
          Number(event.itemAmount ?? 0),
          String(event.detail ?? ''),
          now,
        )
        return sendJson(response, 200, { ok: true })
      }

      if (request.method === 'GET') {
        const dateFilter = url.searchParams.get('date')
        const typeFilter = url.searchParams.get('type')
        let sql = 'SELECT seq, username, date, type, ref_id AS refId, delta_stars AS deltaStars, item_key AS itemKey, item_amount AS itemAmount, detail, created_at AS createdAt FROM event_log WHERE username = ?'
        const params = [username]
        if (dateFilter) { sql += ' AND date = ?'; params.push(dateFilter) }
        if (typeFilter) { sql += ' AND type = ?'; params.push(typeFilter) }
        sql += ' ORDER BY seq DESC LIMIT 500'
        const rows = db.prepare(sql).all(...params)
        return sendJson(response, 200, rows)
      }
    }

    // ─── 以用户为维度的结构化资产查询 ───
    if (parts[0] === 'api' && parts[1] === 'assets' && parts[2] && parts.length === 3) {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' })
      const username = normalizeUsername(decodeURIComponent(parts[2]))
      if (!username) return sendJson(response, 400, { error: 'Username is required' })

      const stars = db.prepare('SELECT total_stars, star_bank, streak, treat_points, egg_tarts, boba_cups, updated_at FROM user_stars WHERE username = ?').get(username)
      const inventoryRows = db.prepare('SELECT item_key, amount, updated_at FROM user_inventory WHERE username = ?').all(username)
      const gardenRows = db.prepare('SELECT plot_id, plot_json, updated_at FROM user_garden WHERE username = ?').all(username)
      const masteryRows = db.prepare('SELECT item_id, mastery_json, updated_at FROM user_mastery WHERE username = ?').all(username)
      const rewardRows = db.prepare('SELECT reward_id, owned, updated_at FROM user_rewards WHERE username = ?').all(username)
      const unlockedRows = db.prepare('SELECT character_id, unlocked_at FROM user_unlocked WHERE username = ?').all(username)
      const profileRow = db.prepare('SELECT age, level, focus_themes, last_visit_date, updated_at FROM user_profile WHERE username = ?').get(username)

      const inventory = {}
      const ingredients = {}
      for (const row of inventoryRows) {
        if (row.item_key.startsWith('ingredient_')) {
          ingredients[row.item_key.replace('ingredient_', '')] = row.amount
        } else {
          inventory[row.item_key] = row.amount
        }
      }

      const gardenPlots = gardenRows.map((row) => JSON.parse(row.plot_json))
      const mastery = {}
      for (const row of masteryRows) {
        mastery[row.item_id] = JSON.parse(row.mastery_json)
      }
      const rewards = {}
      for (const row of rewardRows) {
        rewards[row.reward_id] = { owned: row.owned === 1 }
      }

      return sendJson(response, 200, {
        username,
        stars: stars ?? null,
        inventory,
        ingredients,
        gardenPlots,
        mastery,
        rewards,
        unlockedCharacters: unlockedRows.map((r) => r.character_id),
        profile: profileRow
          ? {
              age: profileRow.age,
              level: profileRow.level,
              focusThemes: profileRow.focus_themes ? profileRow.focus_themes.split(',') : [],
              lastVisitDate: profileRow.last_visit_date,
              updatedAt: profileRow.updated_at,
            }
          : null,
      })
    }

    // ─── 每日快照 ───
    if (parts[0] === 'api' && parts[1] === 'snapshots' && parts[2]) {
      const username = normalizeUsername(decodeURIComponent(parts[2]))
      if (!username) return sendJson(response, 400, { error: 'Username is required' })

      // GET /api/snapshots/:username  →  列出所有快照摘要
      if (request.method === 'GET' && parts.length === 3) {
        const rows = db.prepare(`
          SELECT date, created_at AS createdAt, snapshot_json AS snapshotJson
          FROM daily_snapshots WHERE username = ? ORDER BY date DESC
        `).all(username)
        const summaries = rows.map((row) => {
          const snap = JSON.parse(row.snapshotJson)
          return {
            date: row.date,
            createdAt: row.createdAt,
            totalStars: snap.totalStars ?? 0,
            starBank: snap.starBank ?? 0,
            inventory: snap.inventory ?? {},
            gardenPlots: (snap.gardenPlots ?? []).map((p) => p.kind),
            resultsCount: snap.resultsCount ?? 0,
            masteryCount: snap.masteryCount ?? 0,
          }
        })
        return sendJson(response, 200, summaries)
      }

      // GET /api/snapshots/:username/:date  →  取某天快照详情
      if (request.method === 'GET' && parts.length === 4) {
        const date = parts[3]
        const row = db.prepare('SELECT snapshot_json AS snapshotJson, created_at AS createdAt FROM daily_snapshots WHERE username = ? AND date = ?').get(username, date)
        if (!row) return sendJson(response, 404, { error: 'Snapshot not found' })
        return sendJson(response, 200, { date, createdAt: row.createdAt, snapshot: JSON.parse(row.snapshotJson) })
      }
    }

    // ─── 词库 ───
    if (parts[0] === 'api' && parts[1] === 'curriculum') {
      if (request.method === 'GET' && parts.length === 2) {
        const rows = db.prepare(`
          SELECT id, level, theme, unit, type, text, meaning, emoji, prompt,
            tags_json AS tagsJson, age_range_json AS ageRangeJson,
            difficulty, priority, source, review_interval_days AS reviewIntervalDays,
            audio_src AS audioSrc, image_src AS imageSrc
          FROM curriculum_items ORDER BY source, priority DESC, id
        `).all()
        const items = rows.map((row) => ({
          id: row.id,
          level: row.level,
          theme: row.theme,
          unit: row.unit,
          type: row.type,
          text: row.text,
          meaning: row.meaning,
          emoji: row.emoji,
          prompt: row.prompt,
          tags: JSON.parse(row.tagsJson),
          ageRange: JSON.parse(row.ageRangeJson),
          difficulty: row.difficulty,
          priority: row.priority,
          source: row.source,
          reviewIntervalDays: row.reviewIntervalDays,
          ...(row.audioSrc ? { audioSrc: row.audioSrc } : {}),
          ...(row.imageSrc ? { imageSrc: row.imageSrc } : {}),
        }))
        return sendJson(response, 200, items)
      }

      if (request.method === 'PUT' && parts.length === 2) {
        const items = await readBody(request)
        if (!Array.isArray(items)) return sendJson(response, 400, { error: 'Curriculum must be an array' })
        const now = new Date().toISOString()
        const upsert = db.prepare(`
          INSERT INTO curriculum_items (id, level, theme, unit, type, text, meaning, emoji, prompt, tags_json, age_range_json, difficulty, priority, source, review_interval_days, audio_src, image_src, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            level = excluded.level, theme = excluded.theme, unit = excluded.unit, type = excluded.type,
            text = excluded.text, meaning = excluded.meaning, emoji = excluded.emoji, prompt = excluded.prompt,
            tags_json = excluded.tags_json, age_range_json = excluded.age_range_json,
            difficulty = excluded.difficulty, priority = excluded.priority, source = excluded.source,
            review_interval_days = excluded.review_interval_days, audio_src = excluded.audio_src,
            image_src = excluded.image_src, updated_at = excluded.updated_at
        `)
        db.exec('BEGIN')
        try {
          for (const item of items) {
            upsert.run(
              String(item.id),
              String(item.level ?? 'pre-a1'),
              String(item.theme ?? 'custom'),
              String(item.unit ?? `custom-${item.theme ?? 'custom'}`),
              String(item.type ?? 'word'),
              String(item.text ?? ''),
              String(item.meaning ?? ''),
              String(item.emoji ?? '⭐'),
              String(item.prompt ?? ''),
              JSON.stringify(item.tags ?? []),
              JSON.stringify(item.ageRange ?? [6, 8]),
              Number(item.difficulty ?? 1),
              Number(item.priority ?? 50),
              String(item.source ?? 'custom'),
              Number(item.reviewIntervalDays ?? 2),
              item.audioSrc ? String(item.audioSrc) : null,
              item.imageSrc ? String(item.imageSrc) : null,
              now,
            )
          }
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
        return sendJson(response, 200, { ok: true, count: items.length })
      }

      if (request.method === 'DELETE' && parts.length === 3 && parts[2]) {
        const source = parts[2]
        db.prepare('DELETE FROM curriculum_items WHERE source = ?').run(source)
        return sendJson(response, 200, { ok: true })
      }
    }

    return sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    console.error(error)
    return sendJson(response, 500, { error: error instanceof Error ? error.message : 'Server error' })
  }
})

server.listen(port, 'localhost', () => {
  console.log(`SQLite API (${mode}) listening on http://localhost:${port}`)
  console.log(`Database: ${dbPath}`)
})

const close = () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', close)
process.on('SIGTERM', close)
