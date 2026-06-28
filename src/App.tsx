import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import './App.css'
import { curriculum, getItemById, mergeCurriculum, normalizeCustomCurriculum } from './data/curriculum'
import { inventoryCatalog, recipes, shopItems } from './data/economy'
import {
  buyShopItem,
  canCraftRecipe,
  careForPlot,
  craftRecipe,
  drawLottery,
  harvestPlot,
  plantInPlot,
} from './game/economy'
import { balanceMissionSkills, generateDailyMission, todayKey } from './game/missionGenerator'
import { getMasteryScore, updateMastery } from './game/mastery'
import { listenAndScore, isSpeechRecognitionSupported } from './speech/recognition'
import { speakText, stopSpeaking } from './speech/tts'
import {
  exportGameState,
  importGameStateFile,
  loadGameState,
  resetGameState,
  saveGameState,
} from './storage/db'
import type { GameState, GardenPlot, InventoryKey, Level, MissionTask, PracticeResult, SkillType } from './types'

type View = 'garden' | 'practice' | 'warehouse' | 'shop' | 'lottery' | 'factory' | 'partners' | 'words' | 'parent'

type GardenZone = 'field' | 'coop'

type PrizePopup = { id: string; itemKey?: InventoryKey; text: string; title?: string }

type SlotResultKey = InventoryKey | 'star'

type PracticeStep = 'ready' | 'heard' | 'listening' | 'result'

type PracticeFeedback = { id: string; stars: number; score: number; transcript?: string; message: string } | null

type UiIconKey = 'star' | 'garden' | 'slotMachine' | 'gachaMachine' | 'factory' | 'emptyField' | 'coop'

const uiIcons: Record<UiIconKey, { label: string; src: string }> = {
  star: { label: '星星', src: '/items/星星.png' },
  garden: { label: '啵啵小屋', src: '/items/啵啵小屋.png' },
  slotMachine: { label: '老虎机', src: '/items/老虎机.png' },
  gachaMachine: { label: '扭蛋机', src: '/items/扭蛋机.png' },
  factory: { label: '工厂', src: '/items/工厂.png' },
  emptyField: { label: '空田地', src: '/items/空地.png' },
  coop: { label: '鸡窝', src: '/items/鸡窝.png' },
}

const characters = [
  { id: 'round-hero', name: '星之卡比', points: 0, className: 'pink', imageSrc: '/partners/kabi.png' },
  { id: 'star-knight', name: '魅塔骑士', points: 10, className: 'blue', imageSrc: '/partners/meita.png' },
  { id: 'hammer-king', name: '瓦豆鲁迪', points: 20, className: 'yellow', imageSrc: '/partners/wadou.png' },
  { id: 'orange-helper', name: '帝帝帝大王', points: 30, className: 'orange', imageSrc: '/partners/king.png' },
]

const gardenInventoryKeys: InventoryKey[] = ['strawberrySeed', 'wheatSeed', 'sunlight', 'raindrop', 'chicken', 'chickenFeed']

const slotPreviewKeys: InventoryKey[] = ['strawberrySeed', 'wheatSeed', 'sunlight', 'raindrop', 'chicken', 'pearl', 'tea', 'milk']

const fieldPlotIds = new Set(['plot-1', 'plot-2', 'plot-3', 'plot-4'])

const isInventoryKey = (value: string): value is InventoryKey => value in inventoryCatalog

const makeResultId = () => `result-${Date.now()}-${Math.random().toString(16).slice(2)}`

function App() {
  const speechRunId = useRef(0)
  const [state, setState] = useState<GameState>(() => loadGameState())
  const [view, setView] = useState<View>('garden')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [starBurst, setStarBurst] = useState<{ id: string; stars: number; text: string } | null>(null)
  const [prizeBurst, setPrizeBurst] = useState<PrizePopup | null>(null)
  const [slotRolling, setSlotRolling] = useState(false)
  const [slotResult, setSlotResult] = useState<SlotResultKey[] | null>(null)
  const [selectedWordId, setSelectedWordId] = useState(curriculum[0]?.id ?? '')
  const [wordThemeFilter, setWordThemeFilter] = useState('all')
  const [wordSearch, setWordSearch] = useState('')
  const [practiceStep, setPracticeStep] = useState<PracticeStep>('ready')
  const [practiceFeedback, setPracticeFeedback] = useState<PracticeFeedback>(null)
  const [speaking, setSpeaking] = useState(false)

  const activeCurriculum = useMemo(() => mergeCurriculum(state.customCurriculum), [state.customCurriculum])
  const todayMission = useMemo(() => generateDailyMission(state), [state])
  const activeTask = todayMission.tasks.find((task) => task.id === activeTaskId) ?? todayMission.tasks[0]
  const activeItem = activeTask ? getItemById(activeTask.itemId, activeCurriculum) : undefined
  const activeTaskIndex = todayMission.tasks.findIndex((task) => task.id === activeTask?.id)

  useEffect(() => {
    const hasTodayMission = state.missions.some((mission) => mission.date === todayKey())
    if (!hasTodayMission) {
      setState((current) => {
        const currentDate = todayKey()
        const currentHasTodayMission = current.missions.some((mission) => mission.date === currentDate)
        if (currentHasTodayMission) return current

        const mission = generateDailyMission(current)
        return {
          ...current,
          missions: [...current.missions, mission],
          lastVisitDate: currentDate,
        }
      })
    }
  }, [state.missions])

  useEffect(() => {
    setState((current) => {
      let changed = false
      const missions = current.missions.map((mission) => {
        const balanced = balanceMissionSkills(mission)
        if (balanced !== mission) changed = true
        return balanced
      })
      return changed ? { ...current, missions } : current
    })
  }, [])

  useEffect(() => {
    saveGameState(state)
  }, [state])

  const stopPracticeAudio = () => {
    speechRunId.current += 1
    stopSpeaking()
    setSpeaking(false)
  }

  const speakPracticeText = async (text: string, lang = 'en-US') => {
    const runId = speechRunId.current + 1
    speechRunId.current = runId
    setSpeaking(true)
    try {
      const ok = await speakText(text, lang)
      if (!ok) setFeedback('当前浏览器暂时不能朗读，请换 Chrome 或 Edge 试试。')
      return ok
    } finally {
      if (speechRunId.current === runId) setSpeaking(false)
    }
  }

  const handleViewChange = (nextView: View) => {
    stopPracticeAudio()
    setView(nextView)
  }

  const celebrateStars = (stars: number, text: string, silent = false) => {
    const id = makeResultId()
    setStarBurst({ id, stars, text })
    if (!silent) speakPraiseForStars(stars)
    window.setTimeout(() => {
      setStarBurst((current) => (current?.id === id ? null : current))
    }, 1800)
  }

  const showPrizePopup = (itemKey: InventoryKey | undefined, text: string, title = '获得啦！') => {
    const id = makeResultId()
    setPrizeBurst({ id, itemKey, text, title })
    window.setTimeout(() => {
      setPrizeBurst((active) => (active?.id === id ? null : active))
    }, 1900)
  }

  const completeTask = (task: MissionTask, stars: number, score: number, heardText?: string) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return

    if (stars <= 0) {
      speakPraiseForStars(0)
      setFeedback(`再试试吧。我听到：${heardText || '—'}，得分 ${score}。`)
      return
    }

    const missionTask = todayMission.tasks.find((itemTask) => itemTask.id === task.id) ?? task
    const previousStars = missionTask.completed ? missionTask.stars : 0
    const earnedStars = Math.max(stars - previousStars, 0)

    const result: PracticeResult = {
      id: makeResultId(),
      itemId: item.id,
      skill: task.skill,
      source: 'daily',
      target: item.text,
      heardText,
      stars,
      score,
      createdAt: new Date().toISOString(),
    }

    const nextTasks = todayMission.tasks.map((missionTask) =>
      missionTask.id === task.id
        ? { ...missionTask, completed: true, stars: Math.max(missionTask.stars, stars) }
        : missionTask,
    )
    const completed = nextTasks.every((missionTask) => missionTask.completed)

    setState((current) => {
      const currentMission = current.missions.find((mission) => mission.date === todayMission.date) ?? todayMission
      const currentTask = currentMission.tasks.find((missionTask) => missionTask.id === task.id)
      const currentStars = currentTask?.completed ? currentTask.stars : 0
      const deltaStars = Math.max(stars - currentStars, 0)

      const nextTasks = currentMission.tasks.map((missionTask) =>
        missionTask.id === task.id
          ? { ...missionTask, completed: true, stars: Math.max(missionTask.stars, stars) }
          : missionTask,
      )
      const completed = nextTasks.every((missionTask) => missionTask.completed)
      const nextMission = { ...currentMission, tasks: nextTasks, completed }
      const shouldCountDay = completed && !currentMission.completed

      return {
        ...current,
        missions: current.missions.some((mission) => mission.date === nextMission.date)
          ? current.missions.map((mission) =>
            mission.date === nextMission.date ? nextMission : mission,
          )
          : [...current.missions, nextMission],
        results: [...current.results, result],
        mastery: updateMastery(current.mastery, result),
        totalStars: current.totalStars + deltaStars,
        starBank: current.starBank + deltaStars,
        streak: shouldCountDay ? current.streak + 1 : current.streak,
      }
    })

    if (earnedStars > 0) {
      celebrateStars(earnedStars, item.text, stars >= 3)
    } else if (stars < 3) {
      speakPraiseForStars(stars)
    }

    if (completed) {
      setFeedback(earnedStars > 0 ? `今日任务提分成功，获得 ${earnedStars} 颗星！完成 10 个任务后可以抽奖。` : '这题已经完成啦，发音更棒了！')
    } else {
      setFeedback(earnedStars > 0 ? `获得 ${earnedStars} 颗星！看完结果后可以换下一题。` : '这题已经完成啦，可以继续挑战更高分。')
    }
  }

  const handleFreePractice = async (itemId: string) => {
    const item = getItemById(itemId, activeCurriculum)
    if (!item) return

    stopPracticeAudio()
    setListening(true)
    setFeedback('自由练习不加星星，只提升熟练度。请说英文...')
    try {
      const score = await listenAndScore(item.text)
      speakPraiseForStars(score.stars)
      const result: PracticeResult = {
        id: makeResultId(),
        itemId: item.id,
        skill: 'speak',
        source: 'free',
        target: item.text,
        heardText: score.transcript,
        stars: score.stars,
        score: score.score,
        createdAt: new Date().toISOString(),
      }
      setState((current) => ({
        ...current,
        results: [...current.results, result],
        mastery: updateMastery(current.mastery, result),
      }))
      setFeedback(`自由练习完成：${score.message} 我听到：${score.transcript || '—'}。不增加星星。`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '语音识别失败，请再试一次。')
    } finally {
      setListening(false)
    }
  }

  const handleLottery = () => {
    const mission = state.missions.find((item) => item.date === todayMission.date) ?? todayMission
    if (!mission.completed) {
      setFeedback('先完成今天 10 个英语任务，再来抽奖。')
      return
    }
    if (mission.lotteryClaimed || slotRolling) {
      setFeedback('今天已经抽过奖啦，明天再来。')
      return
    }

    setSlotRolling(true)
    setSlotResult(null)
    window.setTimeout(() => {
      const next = drawLottery(state, mission)
      const prize = next.lotteryHistory[0]
      setState(next)
      setSlotRolling(false)
      if (prize && next !== state) {
        const prizeKey = prize.key ?? 'star'
        setSlotResult([prizeKey, prizeKey, prizeKey])
        showPrizePopup(prize.key, `${prize.label} ×${prize.amount}`, '抽到啦！')
        if (prize.stars) celebrateStars(prize.stars, '每日抽奖')
      }
    }, 1300)
  }

  const handleListenPractice = async (task: MissionTask) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return
    setPracticeFeedback(null)
    setPracticeStep('ready')
    setFeedback(task.skill === 'listen' ? `认真听：${item.text}。听完后点击“我听懂了”。` : `正在播放：${item.text}。听完后再点击“我来说英文”。`)
    const ok = await speakPracticeText(item.text)
    if (!ok) return
    setPracticeStep('heard')
    setFeedback(task.skill === 'listen' ? `听完啦：${item.text}。如果听懂了，就点击“我听懂了”。` : `听完啦：${item.text}。现在可以点击“我来说英文”。`)
  }

  const handleConfirmListenTask = async (task: MissionTask) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return
    completeTask(task, 3, 100, '已听懂')
    setPracticeStep('result')
    setPracticeFeedback({
      id: makeResultId(),
      stars: 3,
      score: 100,
      transcript: '已听懂',
      message: '听力完成！',
    })
    setFeedback(`听力完成！再听一个完整句子：${item.prompt}`)
    await speakPracticeText(item.prompt)
  }

  const handleSpeakPractice = async (task: MissionTask) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return

    setListening(true)
    setPracticeStep('listening')
    setPracticeFeedback(null)
    stopSpeaking()
    setFeedback('请对着麦克风说英文...')
    try {
      const score = await listenAndScore(item.text)
      completeTask(task, score.stars, score.score, score.transcript)
      setPracticeStep('result')
      setPracticeFeedback({
        id: makeResultId(),
        stars: score.stars,
        score: score.score,
        transcript: score.transcript,
        message: score.message,
      })
      if (score.stars >= 3) {
        setFeedback(`三颗星！现在听一个完整句子：${item.prompt}`)
        window.setTimeout(() => {
          void speakPracticeText(item.prompt)
        }, 450)
      } else {
        setFeedback(`${score.message} 我听到：${score.transcript || '—'}，得分 ${score.score}`)
      }
    } catch (error) {
      setPracticeStep('ready')
      setFeedback(error instanceof Error ? error.message : '语音识别失败，请再试一次。')
    } finally {
      setListening(false)
    }
  }

  const runTask = (task: MissionTask) => {
    setActiveTaskId(task.id)
    if (practiceStep === 'ready') return
    if (task.skill === 'listen') {
      void handleConfirmListenTask(task)
      return
    }
    void handleSpeakPractice(task)
  }

  const selectTask = (taskId: string) => {
    stopPracticeAudio()
    setActiveTaskId(taskId)
    setPracticeStep('ready')
    setPracticeFeedback(null)
    setFeedback('')
  }

  const moveToNextTask = () => {
    const nextTask = todayMission.tasks.find((task) => !task.completed && task.id !== activeTask?.id)
      ?? todayMission.tasks[(Math.max(activeTaskIndex, 0) + 1) % Math.max(todayMission.tasks.length, 1)]
    if (nextTask) selectTask(nextTask.id)
  }

  const handleGardenDrop = (plot: GardenPlot, zone: GardenZone, key: InventoryKey) => {
    const meta = inventoryCatalog[key]
    const currentPlot = state.gardenPlots.find((item) => item.id === plot.id)
    const action = getGardenDropAction(currentPlot, zone, key)

    if (!action) {
      setFeedback(`这里不能放 ${meta.label}，换一个位置试试。`)
      return
    }

    setState((current) => action(current))
    setFeedback(`${meta.label} 放好啦！`)
  }

  const handleBuyShopItem = (key: InventoryKey, cost: number) => {
    const meta = inventoryCatalog[key]
    if (state.starBank < cost) {
      setFeedback(`星星还差 ${cost - state.starBank} 个。完成每日练习可以继续获得星星。`)
      return
    }
    setState((current) => buyShopItem(current, key, cost))
    showPrizePopup(key, `${meta.label} ×1`, '兑换成功！')
  }

  const handleCraftRecipe = (recipeId: string) => {
    const recipe = recipes.find((item) => item.id === recipeId)
    if (!recipe) return
    if (!canCraftRecipe(state, recipe)) {
      setFeedback(`材料还不够：${getMissingInputs(state, recipe)}。去花园、兑换或抽奖补充一下吧。`)
      return
    }

    const beforeUnlocked = new Set(state.unlockedCharacters)
    const next = craftRecipe(state, recipeId)
    const newCharacters = characters.filter((character) => !beforeUnlocked.has(character.id) && next.unlockedCharacters.includes(character.id))
    setState(next)
    showPrizePopup(recipe.output, `${recipe.name} ×${recipe.outputAmount}`, '制作完成！')
    if (newCharacters[0]) {
      window.setTimeout(() => {
        showPrizePopup(undefined, `新伙伴：${newCharacters[0].name}`, '伙伴解锁！')
      }, 650)
    }
  }

  const handleHarvestPlot = (plot: GardenPlot) => {
    if (!plot.ready) return
    const meta = getPlotMeta(plot)
    setState((current) => harvestPlot(current, plot.id))
    showPrizePopup(meta.itemKey, `${meta.output} ×1`, '收获啦！')
  }

  const handleProfileChange = (updates: Partial<GameState['learnerProfile']>) => {
    setState((current) => ({
      ...current,
      learnerProfile: {
        ...current.learnerProfile,
        ...updates,
      },
    }))
    setFeedback('学习画像已更新，明天的每日任务会按新设置推荐。')
  }

  const handleCustomCurriculumFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const rows = Array.isArray(parsed) ? parsed : []
      const normalized = normalizeCustomCurriculum(rows)
      setState((current) => ({
        ...current,
        customCurriculum: normalized,
      }))
      setSelectedWordId(normalized[0]?.id ?? selectedWordId)
      setFeedback(`已导入 ${normalized.length} 个自定义词条。`)
    } catch {
      setFeedback('词库导入失败，请使用 JSON 数组格式。')
    }
  }

  const handleImportBackupFile = async (file: File) => {
    try {
      const imported = await importGameStateFile(file)
      setState(imported)
      setActiveTaskId(null)
      setPracticeStep('ready')
      setPracticeFeedback(null)
      setFeedback('备份导入成功，学习记录已经恢复。')
    } catch (error) {
      console.error('Failed to import backup', error)
      setFeedback('备份导入失败，请选择有效的 JSON 备份文件。')
    }
  }

  const completedCount = todayMission.tasks.filter((task) => task.completed).length
  const progress = Math.round((completedCount / Math.max(todayMission.tasks.length, 1)) * 100)
  const themes = Array.from(new Set(activeCurriculum.map((item) => item.theme))).sort()
  const normalizedWordSearch = wordSearch.trim().toLowerCase()
  const filteredCurriculum = activeCurriculum.filter((item) => {
    const matchesTheme = wordThemeFilter === 'all' || item.theme === wordThemeFilter
    const matchesSearch = !normalizedWordSearch
      || item.text.toLowerCase().includes(normalizedWordSearch)
      || item.meaning.toLowerCase().includes(normalizedWordSearch)
      || item.theme.toLowerCase().includes(normalizedWordSearch)
    return matchesTheme && matchesSearch
  })
  const selectedWord = filteredCurriculum.find((item) => item.id === selectedWordId) ?? filteredCurriculum[0]
  const lotteryRemaining = Math.max(todayMission.tasks.length - completedCount, 0)
  const weakWords = activeCurriculum
    .filter((item) => state.mastery[item.id])
    .sort((a, b) => getMasteryScore(state.mastery[a.id]) - getMasteryScore(state.mastery[b.id]))
    .slice(0, 5)

  return (
    <main className="app-shell">
      {starBurst && <StarBurst key={starBurst.id} stars={starBurst.stars} text={starBurst.text} />}
      {prizeBurst && <PrizeBurst key={prizeBurst.id} itemKey={prizeBurst.itemKey} text={prizeBurst.text} title={prizeBurst.title} />}
      <header className="topbar">
        <div>
          <p className="eyebrow">Berry Boba English Factory</p>
          <h1>草莓啵啵英语工厂</h1>
        </div>
        <nav aria-label="主导航">
          {(['garden', 'practice', 'warehouse', 'shop', 'lottery', 'factory', 'partners', 'words', 'parent'] as View[]).map((item) => (
            <button
              className={view === item ? 'nav-button active' : 'nav-button'}
              key={item}
              type="button"
              onClick={() => handleViewChange(item)}
            >
              <TopNavIcon view={item} />
              {viewLabel[item]}
            </button>
          ))}
        </nav>
      </header>

      {view === 'practice' && (
        <section className="practice-layout">
          <div className="card practice-card">
            {activeItem && activeTask ? (
              <>
                <div className="practice-topline">
                  <span>第 {activeTaskIndex + 1}/{todayMission.tasks.length} 题</span>
                  <strong>{completedCount}/{todayMission.tasks.length} 已完成</strong>
                </div>
                <progress className="progress-wrap practice-progress" max="100" value={progress} aria-label={`今日练习进度 ${progress}%`} />
                <WordPicture emoji={activeItem.emoji} theme={activeItem.theme} label={activeItem.text} animated />
                <div className="practice-steps" aria-label="练习步骤">
                  <span className={practiceStep === 'ready' || speaking ? 'active' : ''}>1 听</span>
                  <span className={practiceStep === 'heard' && !speaking ? 'active' : ''}>2 说</span>
                  <span className={practiceStep === 'listening' ? 'active' : ''}>3 识别</span>
                  <span className={practiceStep === 'result' ? 'active' : ''}>4 奖励</span>
                </div>
                <p className="eyebrow">{activeTask.skill === 'listen' ? '听一听，确认听懂英文' : '先听一遍，再勇敢开口'}</p>
                <h2>{activeItem.text}</h2>
                <p className="meaning">{activeItem.meaning}</p>
                <p className="soft-text">{activeItem.prompt}</p>
                <div className={`voice-meter ${listening || speaking ? 'listening' : ''}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="practice-actions">
                  <button type="button" className="ghost-button" disabled={speaking || listening} onClick={() => void handleListenPractice(activeTask)}>
                    {speaking ? '正在播放...' : activeTask.skill === 'listen' ? '🔊 听英文' : '🔊 先听一遍'}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={listening || speaking || practiceStep === 'ready'}
                    onClick={() => runTask(activeTask)}
                  >
                    {activeTask.skill === 'listen'
                      ? speaking ? '听完再点' : practiceStep === 'ready' ? '先听一遍' : '✅ 我听懂了'
                      : listening ? '正在听你说...' : speaking ? '听完再说' : practiceStep === 'ready' ? '先听再说' : '🎤 我来说英文'}
                  </button>
                  <button type="button" className="ghost-button" disabled={listening || speaking} onClick={moveToNextTask}>
                    换一题
                  </button>
                </div>
                {practiceFeedback && (
                  <div className="practice-result" aria-live="polite">
                    <div className="result-stars">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <UiIcon key={index} iconKey="star" label="星星" className={index < practiceFeedback.stars ? 'result-star earned' : 'result-star'} />
                      ))}
                    </div>
                    <strong>{practiceFeedback.score} 分</strong>
                    <p>{practiceFeedback.message}</p>
                    <small>我听到：{practiceFeedback.transcript || '—'}</small>
                    {practiceFeedback.stars >= 3 && (
                      <em>
                        机器正在读完整句：{activeItem.prompt}
                        <button type="button" disabled={speaking || listening} onClick={() => void speakPracticeText(activeItem.prompt)}>
                          🔊 再听完整句
                        </button>
                      </em>
                    )}
                    <div className="result-actions">
                      <button type="button" className="primary-button" disabled={listening || speaking} onClick={moveToNextTask}>
                        下一题
                      </button>
                    </div>
                  </div>
                )}
                {!isSpeechRecognitionSupported() && activeTask.skill === 'speak' && (
                  <p className="warning">当前浏览器可能不支持语音识别，建议使用 Chrome 或 Edge。</p>
                )}
                {feedback && <p className="feedback">{feedback}</p>}
              </>
            ) : (
              <p>今天没有任务啦。</p>
            )}
          </div>

          <div className="task-list">
            {todayMission.tasks.map((task) => {
              const item = getItemById(task.itemId, activeCurriculum)
              return (
                <button
                  className={`${task.id === activeTask?.id ? 'task-card active' : 'task-card'} ${task.completed ? 'done' : ''}`}
                  key={task.id}
                  type="button"
                  onClick={() => selectTask(task.id)}
                >
                  {item && <WordPicture emoji={item.emoji} theme={item.theme} label={item.text} small />}
                  <span className="task-index">{todayMission.tasks.indexOf(task) + 1}</span>
                  <strong>{item?.text}</strong>
                  <small>{skillLabel[task.skill]} · {task.completed ? '完成啦' : '点我练习'}</small>
                  <span className="stars">{Array.from({ length: task.stars }).map((_, index) => <UiIcon key={index} iconKey="star" label="星星" className="task-star-icon" />)}</span>
                  {task.completed && <span className="done-ribbon">✓</span>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {view === 'garden' && (
        <section className="garden-home">
          <div className="card garden-hero-card">
            <div>
              <p className="eyebrow">主页面 · 草莓啵啵小花园</p>
              <h2>把仓库里的东西拖到花园里吧！</h2>
              <p className="soft-text">最多 4 块田、1 个鸡窝。鸡窝最多住 3 只小鸡；拖种子到田里，完成进度后点击成熟作物收获。</p>
              <progress className="progress-wrap" max="100" value={progress} aria-label={`今日进度 ${progress}%`} />
              <strong className="inline-stat">{completedCount}/{todayMission.tasks.length} 个每日任务完成 · 可用星星 <UiIcon iconKey="star" label="星星" className="tiny-inline-icon" /> {state.starBank}</strong>
              <div className="hero-actions">
                <button type="button" className="primary-button" onClick={() => handleViewChange('practice')}>开始今日练习</button>
                <button type="button" className="ghost-button" onClick={() => handleViewChange('warehouse')}>打开仓库</button>
                <button type="button" className="ghost-button" onClick={() => handleViewChange('shop')}>星星兑换</button>
              </div>
            </div>
            <BerryBuddy mood={todayMission.completed ? 'happy' : 'ready'} />
          </div>
          <GardenScene state={state} onDropItem={handleGardenDrop} onHarvest={handleHarvestPlot} />
          <section className="card drag-shelf" aria-label="可拖拽仓库快捷栏">
            <div>
              <p className="eyebrow">鼠标拖拽</p>
              <h3>花园快捷仓库</h3>
              <p className="soft-text shelf-tip">使用鼠标拖动材料到田地或鸡窝。</p>
            </div>
            <div className="drag-item-grid">
              {gardenInventoryKeys.map((key) => (
                <DraggableInventoryItem key={key} itemKey={key} count={state.inventory[key]} compact />
              ))}
            </div>
          </section>
          {feedback && <p className="feedback">{feedback}</p>}
        </section>
      )}

      {view === 'warehouse' && (
        <section className="card">
          <p className="eyebrow">仓库</p>
          <h2>所有材料都在这里，也可以拖到花园</h2>
          <div className="reward-grid inventory-grid">
            {Object.keys(inventoryCatalog).map((key) => (
              <DraggableInventoryItem key={key} itemKey={key as InventoryKey} count={state.inventory[key as InventoryKey]} large />
            ))}
          </div>
        </section>
      )}

      {view === 'shop' && (
        <section className="card">
          <p className="eyebrow">星星兑换</p>
          <h2>用星星换阳光、雨露、种子和鸡食料</h2>
          <p className="soft-text inline-stat">当前可兑换星星：<UiIcon iconKey="star" label="星星" className="tiny-inline-icon" /> {state.starBank}</p>
          <div className="factory-grid">
            {shopItems.map((item) => {
              const meta = inventoryCatalog[item.key]
              return (
                <article className="ingredient-card" key={item.key}>
                  <ItemIcon itemKey={item.key} />
                  <h3>{meta.label}</h3>
                  <strong>{state.inventory[item.key]}</strong>
                  <small>{item.cost} 个星星兑换 1 个{item.shortcut ? ' · 快捷但较贵' : ''}</small>
                  <button type="button" className="ghost-button" disabled={state.starBank < item.cost} onClick={() => handleBuyShopItem(item.key, item.cost)}>
                    {state.starBank >= item.cost ? '兑换' : `还差 ${item.cost - state.starBank} 星`}
                  </button>
                </article>
              )
            })}
          </div>
          {feedback && <p className="feedback">{feedback}</p>}
        </section>
      )}

      {view === 'lottery' && (
        <section className="card slot-page">
          <p className="eyebrow">每日抽奖</p>
          <h2 className="section-title-with-icon"><UiIcon iconKey="slotMachine" label="老虎机" className="title-icon" />摇一摇草莓老虎机，抽今日奖励</h2>
          <div className="slot-machine" aria-label="草莓老虎机抽奖机">
            <UiIcon iconKey="slotMachine" label="老虎机" className="slot-machine-badge" />
            <div className="slot-lights" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => <span key={index} />)}
            </div>
            <div className="slot-screen">
              {[0, 1, 2].map((index) => (
                <div className={slotRolling ? 'slot-reel rolling' : 'slot-reel'} key={index}>
                  {slotRolling ? slotPreviewKeys.map((key) => (
                    <span key={key}><ItemIcon itemKey={key} className="slot-item-icon" /></span>
                  )) : <span>{slotResult?.[index] ? <SlotResultIcon resultKey={slotResult[index]} /> : <UiIcon iconKey="gachaMachine" label="扭蛋机" className="slot-gift-icon" />}</span>}
                </div>
              ))}
            </div>
            <button type="button" className="slot-lever" aria-label="抽奖拉杆" disabled={!todayMission.completed || todayMission.lotteryClaimed || slotRolling} onClick={handleLottery}>
              <span />
            </button>
          </div>
          <div className="mix-panel lottery-panel">
            <div>
              <h3>{slotRolling ? '咕噜咕噜滚动中...' : todayMission.completed ? '今天可以抽奖啦' : '先完成今日练习'}</h3>
              <p className="soft-text">{todayMission.completed ? '可能掉落草莓种子、小麦种子、阳光、雨露、小鸡或工厂材料。' : `还差 ${lotteryRemaining} 题就能抽奖。`}</p>
            </div>
            <button type="button" className="primary-button" disabled={!todayMission.completed || todayMission.lotteryClaimed || slotRolling} onClick={handleLottery}>
              {slotRolling ? '正在摇...' : !todayMission.completed ? '先完成今日任务' : todayMission.lotteryClaimed ? '今天已抽奖' : '摇一下'}
            </button>
          </div>
          <h3>最近抽到</h3>
          <div className="reward-grid inventory-grid">
            {state.lotteryHistory.length ? state.lotteryHistory.slice(0, 8).map((record) => (
              <article className="reward-card" key={record.id}>
                {record.key ? <ItemIcon itemKey={record.key} /> : <UiIcon iconKey="star" label="星星" className="item-icon" />}
                <h3>{record.label}</h3>
                <p>{record.date}</p>
                <strong>×{record.amount}</strong>
              </article>
            )) : <p className="soft-text">还没有抽奖记录。</p>}
          </div>
        </section>
      )}

      {view === 'factory' && (
        <section className="card">
          <p className="eyebrow">工厂制作台</p>
          <h2 className="section-title-with-icon"><UiIcon iconKey="factory" label="工厂" className="title-icon" />制作草莓啵啵和蛋挞来解锁伙伴</h2>
          <div className="recipe-grid">
            {recipes.map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <ItemIcon itemKey={recipe.output} />
                <h3>{recipe.name}</h3>
                <p>{recipe.description}</p>
                <small>{Object.entries(recipe.inputs).map(([key, amount]) => `${inventoryCatalog[key as InventoryKey].label}×${amount}`).join(' · ')}</small>
                {!canCraftRecipe(state, recipe) && <small className="missing-text">还差：{getMissingInputs(state, recipe)}</small>}
                <button type="button" className="ghost-button" disabled={!canCraftRecipe(state, recipe)} onClick={() => handleCraftRecipe(recipe.id)}>
                  {canCraftRecipe(state, recipe) ? '开始制作' : '材料不足'}
                </button>
              </article>
            ))}
          </div>
          {feedback && <p className="feedback">{feedback}</p>}
        </section>
      )}

      {view === 'partners' && (
        <section className="card">
          <p className="eyebrow">角色解锁</p>
          <h2>制作高级道具，邀请 4 个星星伙伴</h2>
          <div className="mix-panel">
            <div>
              <h3>招待点数 {state.treatPoints}</h3>
              <p className="soft-text">草莓啵啵和蛋挞都是高级道具，每制作 1 个获得 1 点。</p>
            </div>
          </div>
          <div className="character-grid">
            {characters.map((character) => {
              const unlocked = state.unlockedCharacters.includes(character.id)
              return (
                <article className={unlocked ? 'character-card unlocked' : 'character-card'} key={character.id}>
                  <MiniCharacter className={character.className} imageSrc={character.imageSrc} name={character.name} />
                  <h3>{character.name}</h3>
                  <p>{unlocked ? '已解锁，会出现在花园里' : `${character.points} 招待点解锁`}</p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {view === 'words' && (
        <section className="card">
          <p className="eyebrow">词库图鉴</p>
          <h2>从 6 岁 Pre-A1 慢慢走到 7 岁 A1</h2>
          <div className="curriculum-summary">
            <span>内置 {curriculum.length} 个</span>
            <span>自定义 {state.customCurriculum.length} 个</span>
            <span>当前 {activeCurriculum.length} 个</span>
            <span>{state.learnerProfile.age} 岁 · {state.learnerProfile.level.toUpperCase()}</span>
          </div>
          <div className="word-toolbar">
            <label>
              搜索
              <input
                type="search"
                value={wordSearch}
                onChange={(event) => setWordSearch(event.target.value)}
                placeholder="输入英文、中文或主题"
              />
            </label>
            <label>
              主题
              <select value={wordThemeFilter} onChange={(event) => setWordThemeFilter(event.target.value)}>
                <option value="all">全部主题</option>
                {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
              </select>
            </label>
            <small>当前显示 {filteredCurriculum.length} 个。每日任务会优先选择薄弱词、到期复习词、适龄词和关注主题。</small>
          </div>
          <div className="word-layout">
            <div className="word-list">
              {filteredCurriculum.length ? filteredCurriculum.map((item) => {
                const score = getMasteryScore(state.mastery[item.id])
                return (
                  <button
                    className={item.id === selectedWord?.id ? 'word-row active' : 'word-row'}
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedWordId(item.id)}
                  >
                    <strong>{item.text}</strong>
                    <span>{item.meaning}</span>
                    <small>{item.level.toUpperCase()} · {item.theme} · 难度 {item.difficulty} · 熟练度 {score}%</small>
                  </button>
                )
              }) : <p className="empty-state">没有找到匹配的词，换个关键词试试。</p>}
            </div>
            {selectedWord && (
              <article className="word-detail">
                <WordPicture emoji={selectedWord.emoji} theme={selectedWord.theme} label={selectedWord.text} animated />
                <p className="eyebrow">自由练习</p>
                <h3>{selectedWord.text}</h3>
                <p className="meaning">{selectedWord.meaning}</p>
                <p className="soft-text">{selectedWord.prompt}</p>
                <p className="word-meta">{selectedWord.source === 'custom' ? '自定义词库' : '内置词库'} · {selectedWord.unit} · {selectedWord.ageRange[0]}-{selectedWord.ageRange[1]} 岁 · 每 {selectedWord.reviewIntervalDays} 天复习</p>
                <meter min="0" max="100" value={getMasteryScore(state.mastery[selectedWord.id])} />
                <span>熟练度 {getMasteryScore(state.mastery[selectedWord.id])}%</span>
                <div className="practice-actions">
                  <button type="button" className="ghost-button" disabled={speaking} onClick={() => void speakPracticeText(selectedWord.text)}>
                    试听
                  </button>
                  <button type="button" className="primary-button" disabled={listening || speaking} onClick={() => handleFreePractice(selectedWord.id)}>
                    自由练习
                  </button>
                </div>
                <p className="soft-text">自由练习只提升熟练度，不获得星星；星星来自每日任务。</p>
              </article>
            )}
          </div>
          {feedback && <p className="feedback">{feedback}</p>}
        </section>
      )}

      {view === 'parent' && (
        <section className="card parent-panel">
          <p className="eyebrow">家长记录</p>
          <h2>学习记录和备份</h2>
          <div className="parent-grid">
            <InfoTile label="练习次数" value={state.results.length} />
            <InfoTile label="总星星" value={state.totalStars} />
            <InfoTile label="可兑换星星" value={state.starBank} />
            <InfoTile label="啵啵杯数" value={state.bobaCups} />
            <InfoTile label="蛋挞数量" value={state.eggTarts} />
            <InfoTile label="招待点数" value={state.treatPoints} />
            <InfoTile label="解锁角色" value={state.unlockedCharacters.length} />
            <InfoTile label="完成天数" value={state.missions.filter((mission) => mission.completed).length} />
            <InfoTile label="连续奖励" value={state.streak} />
          </div>
          <h3>需要多练的词</h3>
          <ul className="weak-list">
            {weakWords.length ? weakWords.map((item) => (
              <li key={item.id}>{item.text} · 熟练度 {getMasteryScore(state.mastery[item.id])}%</li>
            )) : <li>还没有薄弱词，先完成几次练习吧。</li>}
          </ul>
          <div className="hero-actions">
            <button type="button" className="ghost-button" onClick={() => exportGameState(state)}>
              导出备份
            </button>
            <label className="ghost-button file-button">
              导入备份
              <input
                type="file"
                accept="application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (file) await handleImportBackupFile(file)
                  event.currentTarget.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                if (window.confirm('确定要清空所有学习记录吗？')) {
                  const freshState = resetGameState()
                  setState({
                    ...freshState,
                    missions: [generateDailyMission(freshState)],
                  })
                }
              }}
            >
              清空记录
            </button>
          </div>
          <section className="curriculum-admin">
            <h3>词库和推荐设置</h3>
            <div className="profile-controls">
              <label>
                年龄
                <input
                  min="4"
                  max="10"
                  type="number"
                  value={state.learnerProfile.age}
                  onChange={(event) => handleProfileChange({ age: Number(event.target.value) })}
                />
              </label>
              <label>
                阶段
                <select value={state.learnerProfile.level} onChange={(event) => handleProfileChange({ level: event.target.value as Level })}>
                  <option value="pre-a1">Pre-A1</option>
                  <option value="a1">A1</option>
                </select>
              </label>
              <label>
                关注主题
                <input
                  value={state.learnerProfile.focusThemes.join(', ')}
                  onChange={(event) => handleProfileChange({ focusThemes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                  placeholder="food, animals, colors"
                />
              </label>
            </div>
            <div className="hero-actions">
              <label className="ghost-button file-button">
                导入词库 JSON
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (file) await handleCustomCurriculumFile(file)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <button type="button" className="ghost-button" onClick={() => setState((current) => ({ ...current, customCurriculum: [] }))}>
                清空自定义词库
              </button>
            </div>
            <p className="soft-text">自定义词库格式：JSON 数组，至少包含 text 和 meaning，可选 theme、level、emoji、prompt、difficulty、priority。</p>
          </section>
          <p className="soft-text">
            当前词库、画像和学习记录都保存在浏览器本地存储。建议每周导出一次 JSON 备份。
          </p>
          {feedback && <p className="feedback">{feedback}</p>}
        </section>
      )}
    </main>
  )
}

const viewLabel: Record<View, string> = {
  garden: '花园',
  practice: '练习',
  warehouse: '仓库',
  shop: '兑换',
  lottery: '抽奖',
  factory: '制作',
  partners: '伙伴',
  words: '词库',
  parent: '家长',
}

const skillLabel: Record<SkillType, string> = {
  listen: '听力',
  speak: '口语',
}

function getMissingInputs(state: GameState, recipe: (typeof recipes)[number]) {
  return Object.entries(recipe.inputs)
    .map(([key, amount]) => {
      const itemKey = key as InventoryKey
      const missing = Math.max((amount ?? 0) - (state.inventory[itemKey] ?? 0), 0)
      return missing > 0 ? `${inventoryCatalog[itemKey].label}×${missing}` : ''
    })
    .filter(Boolean)
    .join('、') || '无'
}

function getGardenDropAction(plot: GardenPlot | undefined, zone: GardenZone, key: InventoryKey) {
  if (!plot) return null

  if (zone === 'field') {
    if (plot.kind === 'empty' && key === 'strawberrySeed') {
      return (current: GameState) => plantInPlot(current, plot.id, 'strawberry')
    }
    if (plot.kind === 'empty' && key === 'wheatSeed') {
      return (current: GameState) => plantInPlot(current, plot.id, 'wheat')
    }
    if ((plot.kind === 'strawberry' || plot.kind === 'wheat') && (key === 'sunlight' || key === 'raindrop')) {
      return (current: GameState) => careForPlot(current, plot.id, key)
    }
  }

  if (zone === 'coop') {
    if ((plot.kind === 'empty' || plot.kind === 'chicken') && key === 'chicken' && (plot.chickens ?? 0) < 3) {
      return (current: GameState) => plantInPlot(current, plot.id, 'chicken')
    }
    if (plot.kind === 'chicken' && key === 'chickenFeed') {
      return (current: GameState) => careForPlot(current, plot.id, 'chickenFeed')
    }
  }

  return null
}

function GardenPlotCard({
  plot,
  zone,
  onDropItem,
  onHarvest,
}: {
  plot: GardenPlot
  zone: GardenZone
  onDropItem: (plot: GardenPlot, zone: GardenZone, key: InventoryKey) => void
  onHarvest: (plot: GardenPlot) => void
}) {
  const plotMeta = getPlotMeta(plot, zone)
  const hint = getPlotHint(plot, zone)
  const ariaLabel = `${plotMeta.label}：${hint}`
  const shortHint = getShortPlotHint(plot, zone)

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const key = event.dataTransfer.getData('text/plain')
    if (isInventoryKey(key)) onDropItem(plot, zone, key)
  }

  const handleHarvestClick = () => {
    if (plot.ready) onHarvest(plot)
  }

  return (
    <article
      className={`plot-card ${zone} ${plot.kind} ${plot.ready ? 'ready' : ''}`}
      aria-label={ariaLabel}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onClick={handleHarvestClick}
    >
      <div className="plot-art">{renderPlotArt(plot, zone)}</div>
      <h3>{plotMeta.label}</h3>
      <div className="plot-status-icons" aria-hidden="true">
        {renderPlotStatus(plot, zone)}
      </div>
      {plot.ready ? (
        <button type="button" className="primary-button" onClick={(event) => { event.stopPropagation(); onHarvest(plot) }}>
          收获 {plotMeta.output}
        </button>
      ) : shortHint ? (
        <div className="plot-actions">
          <small>{shortHint}</small>
        </div>
      ) : null}
    </article>
  )
}

function getPlotHint(plot: GardenPlot, zone: GardenZone) {
  if (zone === 'field' && plot.kind === 'empty') return '拖草莓种子或小麦种子到这里。'
  if (zone === 'coop' && plot.kind === 'empty') return '拖小鸡到这里，最多 3 只。'
  if (plot.kind === 'chicken') return plot.ready ? '小鸡下蛋啦，点击收获。' : `拖小鸡或鸡食料到这里，当前 ${plot.chickens ?? 1}/3 只。`
  if (plot.kind === 'strawberry' || plot.kind === 'wheat') return plot.ready ? '已经长大啦，点击收获。' : '照料进度会显示在田地下面。'
  return '等待放入材料。'
}

function getShortPlotHint(plot: GardenPlot, zone: GardenZone) {
  if (plot.kind === 'empty' && zone === 'field') return '放种子'
  if (plot.kind === 'empty' && zone === 'coop') return '放小鸡'
  if (plot.kind === 'chicken') return plot.ready ? '可收蛋' : `${plot.chickens ?? 1}/3 小鸡`
  if (plot.kind === 'strawberry' || plot.kind === 'wheat') return plot.ready ? '可收获' : ''
  return '拖到这里'
}

function getPlotMeta(plot: GardenPlot, zone?: GardenZone): { itemKey?: InventoryKey; label: string; output: string } {
  if (plot.kind === 'strawberry') return { itemKey: plot.ready ? 'strawberry' : 'strawberrySeed', label: '草莓地', output: '草莓' }
  if (plot.kind === 'wheat') return { itemKey: plot.ready ? 'wheat' : 'wheatSeed', label: '小麦地', output: '小麦' }
  if (plot.kind === 'chicken') return { itemKey: plot.ready ? 'egg' : 'chicken', label: `鸡窝 ${plot.chickens ?? 1}/3`, output: '鸡蛋' }
  if (zone === 'coop') return { label: '空鸡窝', output: '' }
  return { label: '空花田', output: '' }
}

function GardenScene({
  state,
  onDropItem,
  onHarvest,
}: {
  state: GameState
  onDropItem: (plot: GardenPlot, zone: GardenZone, key: InventoryKey) => void
  onHarvest: (plot: GardenPlot) => void
}) {
  const unlockedCharacters = characters.filter((character) => state.unlockedCharacters.includes(character.id))
  const fieldPlots = state.gardenPlots.filter((plot) => fieldPlotIds.has(plot.id)).slice(0, 4)
  const coopPlot = state.gardenPlots.find((plot) => !fieldPlotIds.has(plot.id))

  return (
    <section className="garden-scene playable-garden" aria-label="可拖拽小花园">
      <div className="garden-ground">
        <div className="garden-paths" aria-hidden="true">
          <span className="path-ring" />
          <span className="path-main" />
          <span className="path-coop" />
        </div>
        <div className="garden-house">
          <UiIcon iconKey="garden" label="啵啵小屋" className="garden-house-icon" />
          <strong>啵啵小屋</strong>
        </div>
        <div className="garden-field-zone" aria-label="四块田地">
          {fieldPlots.map((plot) => (
            <GardenPlotCard key={plot.id} plot={plot} zone="field" onDropItem={onDropItem} onHarvest={onHarvest} />
          ))}
        </div>
        {coopPlot && (
          <>
            <div className="garden-coop-zone" aria-label="一个鸡窝">
              <GardenPlotCard plot={coopPlot} zone="coop" onDropItem={onDropItem} onHarvest={onHarvest} />
            </div>
          </>
        )}
        <div className="garden-characters">
          {unlockedCharacters.map((character, index) => (
            <div className={`garden-friend friend-${index + 1}`} key={character.id}>
              <MiniCharacter className={character.className} imageSrc={character.imageSrc} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DraggableInventoryItem({
  itemKey,
  count,
  large = false,
  compact = false,
}: {
  itemKey: InventoryKey
  count: number
  large?: boolean
  compact?: boolean
}) {
  const meta = inventoryCatalog[itemKey]
  const canDrag = count > 0

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (!canDrag) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemKey)
  }

  return (
    <article
      className={`reward-card draggable-item ${large ? 'large' : ''} ${compact ? 'compact' : ''} ${canDrag ? '' : 'empty'}`}
      draggable={canDrag}
      onDragStart={handleDragStart}
      title={canDrag ? `拖动 ${meta.label}` : `${meta.label} 数量为 0`}
    >
      <ItemIcon itemKey={itemKey} />
      {!compact && (
        <>
          <h3>{meta.label}</h3>
          <p>{meta.group}</p>
          <strong>拥有 {count}</strong>
          <small>{canDrag ? '拖到花园使用' : '暂无'}</small>
        </>
      )}
    </article>
  )
}

function ItemIcon({ itemKey, className = '' }: { itemKey: InventoryKey; className?: string }) {
  const meta = inventoryCatalog[itemKey]

  return (
    <div className={`item-icon icon-${itemKey} ${className}`} aria-label={`${meta.label}图标`} role="img">
      {meta.iconSrc && <img src={meta.iconSrc} alt="" />}
    </div>
  )
}

function TopNavIcon({ view }: { view: View }) {
  return (
    <span className="top-nav-icon" aria-hidden="true">
      <img src={`/top-icons/${viewLabel[view]}图标.png`} alt="" />
    </span>
  )
}

function SlotResultIcon({ resultKey }: { resultKey: SlotResultKey }) {
  return resultKey === 'star'
    ? <UiIcon iconKey="star" label="星星" className="slot-item-icon" />
    : <ItemIcon itemKey={resultKey} className="slot-item-icon" />
}

function UiIcon({
  iconKey,
  label,
  className = '',
  srcOverride,
}: {
  iconKey: UiIconKey
  label?: string
  className?: string
  srcOverride?: string
}) {
  const icon = uiIcons[iconKey]

  return (
    <span className={`ui-icon ui-icon-${iconKey} ${className}`} aria-label={`${label ?? icon.label}图标`} role="img">
      <img src={srcOverride ?? icon.src} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
    </span>
  )
}

function renderPlotArt(plot: GardenPlot, zone: GardenZone) {
  if (plot.kind === 'empty' && zone === 'field') return <UiIcon iconKey="emptyField" label="空田地" className="plot-ui-icon" />
  if (zone === 'coop') {
    return (
      <div className="coop-with-chickens">
        <UiIcon iconKey="coop" label="鸡窝" className="plot-ui-icon coop-base-icon" />
        {plot.kind === 'chicken' && (
          <div className="coop-chicken-stack" aria-hidden="true">
            {Array.from({ length: Math.min(plot.chickens ?? 1, 3) }).map((_, index) => (
              <ItemIcon key={index} itemKey="chicken" className={`coop-chicken-icon chicken-${index + 1}`} />
            ))}
          </div>
        )}
      </div>
    )
  }
  if (plot.kind === 'strawberry') return <ItemIcon itemKey={plot.ready ? 'strawberry' : 'strawberrySeed'} className="plot-item-icon" />
  if (plot.kind === 'wheat') return <ItemIcon itemKey={plot.ready ? 'wheat' : 'wheatSeed'} className="plot-item-icon" />
  return null
}

function renderPlotStatus(plot: GardenPlot, zone: GardenZone) {
  if (plot.kind === 'empty' && zone === 'field') {
    return (
      <>
        <ItemIcon itemKey="strawberrySeed" className="mini-status-icon" />
        <ItemIcon itemKey="wheatSeed" className="mini-status-icon" />
      </>
    )
  }

  if (plot.kind === 'empty' && zone === 'coop') {
    return <ItemIcon itemKey="chicken" className="mini-status-icon" />
  }

  if (plot.kind === 'chicken') {
    return (
      <>
        {plot.ready ? <ItemIcon itemKey="egg" className="mini-status-icon" /> : <ItemIcon itemKey="chickenFeed" className="mini-status-icon" />}
        {(plot.chickens ?? 1) < 3 && <ItemIcon itemKey="chicken" className="mini-status-icon" />}
      </>
    )
  }

  if (plot.kind === 'strawberry' || plot.kind === 'wheat') {
    return (
      <div className="plot-growth-progress">
        <span className={`growth-step sunlight ${plot.sunlight ? 'done' : ''}`} />
        <span className={`growth-step raindrop ${plot.raindrop ? 'done' : ''}`} />
      </div>
    )
  }

  return null
}

function speakPraiseForStars(stars: number) {
  const praise = stars >= 3 ? '你超级棒！' : stars === 2 ? '不错哦！' : stars === 1 ? '还可以。' : '再试试吧。'
  speakText(praise, 'zh-CN')
}

function BerryBuddy({ mood }: { mood: 'happy' | 'ready' }) {
  return (
    <div className={`buddy ${mood} with-image`} aria-label="首页伙伴形象" role="img">
      <img src="/partners/kabi.png" alt="" />
    </div>
  )
}

function WordPicture({
  emoji,
  theme,
  label,
  animated = false,
  small = false,
}: {
  emoji: string
  theme: string
  label: string
  animated?: boolean
  small?: boolean
}) {
  const safeTheme = theme.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  return (
    <div
      className={`word-picture theme-${safeTheme} ${animated ? 'animated' : ''} ${small ? 'small' : ''}`}
      aria-label={`${label} 的可爱图卡`}
      role="img"
    >
      <span className="picture-glow" />
      <span className="picture-sparkle one">✦</span>
      <span className="picture-sparkle two">✧</span>
      <span className="picture-emoji">{emoji}</span>
      <span className="picture-bubble a" />
      <span className="picture-bubble b" />
    </div>
  )
}

function StarBurst({ stars, text }: { stars: number; text: string }) {
  return (
    <div className="star-burst" aria-live="polite" aria-label={`获得 ${stars} 颗星星`}>
      <div className="star-burst-card">
        <div className="big-stars">
          {Array.from({ length: stars }).map((_, index) => <UiIcon key={index} iconKey="star" label="星星" className="big-star-icon" />)}
        </div>
        <strong>太棒啦！</strong>
        <span>{text} +{stars} 星</span>
      </div>
      {Array.from({ length: 18 }).map((_, index) => (
        <i key={index}><UiIcon iconKey="star" label="飞出的星星" className="flying-star-icon" /></i>
      ))}
    </div>
  )
}

function PrizeBurst({ itemKey, text, title = '抽到啦！' }: { itemKey?: InventoryKey; text: string; title?: string }) {
  return (
    <div className="prize-burst" aria-live="polite" aria-label={`抽到 ${text}`}>
      <div className="prize-box">
        <UiIcon iconKey="gachaMachine" label="扭蛋机" className="gift-lid" />
        {itemKey ? <ItemIcon itemKey={itemKey} className="prize-emoji" /> : <UiIcon iconKey="gachaMachine" label="伙伴" className="prize-emoji" />}
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  )
}

function MiniCharacter({
  className,
  imageSrc,
  name,
}: {
  className: string
  imageSrc?: string
  name?: string
}) {
  const ariaProps = name ? { 'aria-label': name, role: 'img' } : { 'aria-hidden': true }

  return (
    <div className={`mini-character ${className} ${imageSrc ? 'with-image' : ''}`} {...ariaProps}>
      {imageSrc ? <img src={imageSrc} alt="" /> : (
        <>
          <span />
          <span />
          <b />
        </>
      )}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
