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
  getDailyLotteryStats,
  harvestPlot,
  plantInPlot,
} from './game/economy'
import { balanceMissionSkills, createInitialState, generateDailyMission, isListeningChoiceItem, todayKey } from './game/missionGenerator'
import { getMasteryScore, updateMastery } from './game/mastery'
import { listenAndScore, isSpeechRecognitionSupported } from './speech/recognition'
import { speakText, stopSpeaking } from './speech/tts'
import {
  clearLegacyBrowserStorage,
  exportGameState,
  getActiveUsername,
  getSnapshots,
  getSnapshotDetail,
  importGameStateFile,
  loginOrCreateAccount,
  logoutAccount,
  loadGameState,
  resetGameState,
  saveGameState,
  logEvent,
  getEventLog,
  loadCurriculumFromDb,
  saveCurriculumToDb,
} from './storage/db'
import type { EventLogEntry, SnapshotSummary } from './storage/db'
import type { GameState, GardenPlot, InventoryKey, LearningItem, Level, MissionTask, PracticeResult, SkillType } from './types'

type View = 'garden' | 'practice' | 'warehouse' | 'shop' | 'lottery' | 'factory' | 'partners' | 'words' | 'parent'

type GardenZone = 'field' | 'coop'

type PrizePopup = { id: string; itemKey?: InventoryKey; text: string; title?: string }

type SlotResultKey = InventoryKey | 'star'

type CraftAnimation = {
  id: string
  recipeId: string
  recipeName: string
  inputKeys: InventoryKey[]
  outputKey: InventoryKey
}

const defaultFieldCareRequirement = 2
const getFieldCareRequirement = (plotKind?: GardenPlot['kind']) => (plotKind === 'teaLeaf' ? 1 : defaultFieldCareRequirement)

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

const gardenInventoryKeys: InventoryKey[] = ['strawberrySeed', 'wheatSeed', 'teaLeafSeed', 'sunlight', 'raindrop', 'chicken', 'chickenFeed']

const slotPreviewKeys: InventoryKey[] = ['strawberrySeed', 'wheatSeed', 'sunlight', 'raindrop', 'chicken', 'pearl', 'tea', 'milk']

const fieldPlotIds = new Set(['plot-1', 'plot-2', 'plot-3', 'plot-4'])

const isInventoryKey = (value: string): value is InventoryKey => value in inventoryCatalog

const makeResultId = () => `result-${Date.now()}-${Math.random().toString(16).slice(2)}`

const normalizeSpelling = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '')

const simpleHash = (text: string) => {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value << 5) - value + text.charCodeAt(index)
    value |= 0
  }
  return Math.abs(value)
}

const buildListeningChoices = (target: LearningItem | undefined, items: LearningItem[], date: string) => {
  if (!target) return []
  const candidates = items.filter((item) => item.id !== target.id && isListeningChoiceItem(item))
  const sameTheme = candidates.filter((item) => item.theme === target.theme)
  const pool = [...sameTheme, ...candidates.filter((item) => item.theme !== target.theme)]
  const distractors = pool
    .sort((left, right) => simpleHash(`${target.id}-${date}-${left.id}`) - simpleHash(`${target.id}-${date}-${right.id}`))
    .slice(0, 3)
  return [target, ...distractors]
    .sort((left, right) => simpleHash(`${date}-${target.id}-choice-${left.id}`) - simpleHash(`${date}-${target.id}-choice-${right.id}`))
}

function App() {
  const speechRunId = useRef(0)
  const craftTimerRef = useRef<number | null>(null)
  const loadedUserRef = useRef<string | null>(null)
  const [currentUser, setCurrentUser] = useState(() => getActiveUsername())
  const [state, setState] = useState<GameState>(() => createInitialState())
  const [storageReady, setStorageReady] = useState(false)
  const [loginName, setLoginName] = useState(currentUser)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [view, setView] = useState<View>('garden')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [starBurst, setStarBurst] = useState<{ id: string; stars: number; text: string } | null>(null)
  const [prizeBurst, setPrizeBurst] = useState<PrizePopup | null>(null)
  const [slotRolling, setSlotRolling] = useState(false)
  const [slotResult, setSlotResult] = useState<SlotResultKey[] | null>(null)
  const [craftAnimation, setCraftAnimation] = useState<CraftAnimation | null>(null)
  const [selectedWordId, setSelectedWordId] = useState(curriculum[0]?.id ?? '')
  const [wordThemeFilter, setWordThemeFilter] = useState('all')
  const [wordSearch, setWordSearch] = useState('')
  const [practiceStep, setPracticeStep] = useState<PracticeStep>('ready')
  const [practiceFeedback, setPracticeFeedback] = useState<PracticeFeedback>(null)
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [snapshotDetail, setSnapshotDetail] = useState<Record<string, unknown> | null>(null)
  const [snapshotDetailDate, setSnapshotDetailDate] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [listeningAttempts, setListeningAttempts] = useState<Record<string, number>>({})
  const [spellingInput, setSpellingInput] = useState('')

  const activeCurriculum = useMemo(() => mergeCurriculum(state.customCurriculum), [state.customCurriculum])
  const todayMission = useMemo(() => generateDailyMission(state), [state])
  const activeTask = todayMission.tasks.find((task) => task.id === activeTaskId) ?? todayMission.tasks[0]
  const activeItem = activeTask ? getItemById(activeTask.itemId, activeCurriculum) : undefined
  const activeTaskIndex = todayMission.tasks.findIndex((task) => task.id === activeTask?.id)

  useEffect(() => {
    clearLegacyBrowserStorage()
  }, [])

  useEffect(() => {
    let cancelled = false
    setStorageReady(false)
    loadedUserRef.current = null

    void loadGameState(currentUser).then((nextState) => {
      if (!cancelled) {
        setState(nextState)
        setStorageReady(true)
        loadedUserRef.current = currentUser
        void getEventLog(currentUser).then((logs) => { if (!cancelled) setEventLog(logs) })
        void getSnapshots(currentUser).then((snaps) => { if (!cancelled) setSnapshots(snaps) })
      }
    })

    return () => {
      cancelled = true
    }
  }, [currentUser])

  useEffect(() => {
    if (!storageReady || !currentUser) return
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
  }, [state.missions, storageReady, currentUser])

  useEffect(() => {
    if (!storageReady || !currentUser) return
    setState((current) => {
      let changed = false
      const missions = current.missions.map((mission) => {
        const balanced = balanceMissionSkills(mission, activeCurriculum)
        if (balanced !== mission) changed = true
        return balanced
      })
      return changed ? { ...current, missions } : current
    })
  }, [activeCurriculum, storageReady, currentUser])

  useEffect(() => {
    if (!currentUser || !storageReady) return
    if (loadedUserRef.current !== currentUser) return
    void saveGameState(state, currentUser)
  }, [state, currentUser, storageReady])

  // 启动时把内置词库同步到数据库（只执行一次）
  const [curriculumSynced, setCurriculumSynced] = useState(false)
  useEffect(() => {
    if (curriculumSynced) return
    void loadCurriculumFromDb().then((dbItems) => {
      const dbIds = new Set(dbItems.map((item) => item.id))
      const missing = curriculum.filter((item) => !dbIds.has(item.id))
      if (missing.length) {
        void saveCurriculumToDb(missing)
      }
      setCurriculumSynced(true)
    })
  }, [curriculumSynced])

  // 自定义词库变更时同步到数据库
  useEffect(() => {
    if (!curriculumSynced || !storageReady) return
    if (state.customCurriculum.length) {
      void saveCurriculumToDb(state.customCurriculum)
    }
  }, [state.customCurriculum, curriculumSynced, storageReady])

  useEffect(() => () => {
    if (craftTimerRef.current) window.clearTimeout(craftTimerRef.current)
  }, [])

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

  const speakPracticeSequence = async (parts: Array<{ text: string; lang: 'en-US' | 'zh-CN' }>) => {
    const runId = speechRunId.current + 1
    speechRunId.current = runId
    setSpeaking(true)
    try {
      for (const part of parts) {
        if (speechRunId.current !== runId) return false
        const ok = await speakText(part.text, part.lang)
        if (!ok) {
          setFeedback('当前浏览器暂时不能朗读，请换 Chrome 或 Edge 试试。')
          return false
        }
      }
      return true
    } finally {
      if (speechRunId.current === runId) setSpeaking(false)
    }
  }

  const speakPracticeItem = (item: LearningItem) => speakPracticeSequence([
    { text: item.text, lang: 'en-US' },
    { text: item.meaning, lang: 'zh-CN' },
  ])

  const handleViewChange = (nextView: View) => {
    stopPracticeAudio()
    setView(nextView)
  }

  const handleLogin = async () => {
    const result = await loginOrCreateAccount(loginName, loginPassword)
    setLoginMessage(result.message)
    if (!result.ok || !result.username) return

    setCurrentUser(result.username)
    setLoginName(result.username)
    setLoginPassword('')
    setActiveTaskId(null)
    setPracticeStep('ready')
    setPracticeFeedback(null)
    setListeningAttempts({})
    setSpellingInput('')
    setFeedback('')
    setView('garden')
  }

  const handleLogout = () => {
    stopPracticeAudio()
    logoutAccount()
    setCurrentUser('')
    setStorageReady(false)
    setLoginName('')
    setLoginPassword('')
    setLoginMessage('已退出登录。')
    setView('garden')
    setActiveTaskId(null)
    setPracticeStep('ready')
    setPracticeFeedback(null)
    setListeningAttempts({})
    setSpellingInput('')
  }

  const finishCraftAnimation = (animation: CraftAnimation, beforeUnlocked: Set<string>) => {
    const recipe = recipes.find((item) => item.id === animation.recipeId)
    if (!recipe) return

    setState((current) => {
      if (!canCraftRecipe(current, recipe)) return current
      return craftRecipe(current, recipe.id)
    })
    setCraftAnimation((current) => (current?.id === animation.id ? null : current))
    showPrizePopup(recipe.output, `${recipe.name} ×${recipe.outputAmount}`, '制作成功！')
    void logEvent({
      type: 'craft',
      refId: recipe.id,
      itemKey: recipe.output,
      itemAmount: recipe.outputAmount,
      detail: `制作 ${recipe.name}`,
    })

    window.setTimeout(() => {
      setState((current) => {
        const newCharacters = characters.filter((character) => !beforeUnlocked.has(character.id) && current.unlockedCharacters.includes(character.id))
        if (newCharacters[0]) showPrizePopup(undefined, `新伙伴：${newCharacters[0].name}`, '伙伴解锁！')
        return current
      })
    }, 650)
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
      void logEvent({
        type: 'practice_stars',
        refId: result.id,
        deltaStars: earnedStars,
        detail: `${task.skill}/${item.text} ★${stars}`,
      })
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
    const lotteryStats = getDailyLotteryStats(mission)
    if (lotteryStats.availableDraws <= 0) {
      setFeedback('当天获得 10 个星星可以抽奖 1 次，继续练习攒星星吧。')
      return
    }
    if (lotteryStats.remainingDraws <= 0 || slotRolling) {
      setFeedback(lotteryStats.availableDraws >= 3 ? '今天 3 次抽奖已经用完啦，明天再来。' : `今天已抽 ${lotteryStats.claimedDraws} 次，再到 ${lotteryStats.nextTargetStars} 星可多抽 1 次。`)
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
        showPrizePopup(prize.key, `${prize.label} ×${prize.amount}`, prize.guaranteed ? '牛奶保底到啦！' : '抽到啦！')
        if (prize.stars) celebrateStars(prize.stars, '每日抽奖')
        void logEvent({
          type: 'lottery',
          refId: prize.id,
          deltaStars: prize.stars ?? 0,
          itemKey: prize.key,
          itemAmount: prize.amount,
          detail: prize.guaranteed ? '10抽保底' : '抽奖',
        })
        const nextMission = next.missions.find((item) => item.date === mission.date) ?? mission
        const nextLotteryStats = getDailyLotteryStats(nextMission)
        const guaranteedHint = prize.guaranteed ? ' 已触发 10 抽牛奶保底。' : ''
        setFeedback(nextLotteryStats.remainingDraws > 0 ? `还可以再抽 ${nextLotteryStats.remainingDraws} 次。${guaranteedHint}` : `今天可用抽奖次数已用完。${guaranteedHint}`)
      }
    }, 1300)
  }

  const handleListenPractice = async (task: MissionTask) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return
    setPracticeFeedback(null)
    setPracticeStep('ready')
    setFeedback(task.skill === 'listen' ? '认真听英文，听完后选择正确图案。' : task.skill === 'spell' ? `先看清每个字母，再跟读：${item.text}。` : `正在播放：${item.text}。听完后再点击“我来说英文”。`)
    const ok = task.skill === 'listen' ? await speakPracticeText(item.text) : await speakPracticeItem(item)
    if (!ok) return
    setPracticeStep('heard')
    setFeedback(task.skill === 'listen' ? '听完啦，请选择你听到的图案。' : task.skill === 'spell' ? `照着上面的单词，把完整字母打出来：${item.text}` : `听完啦：${item.text}。现在可以点击“我来说英文”。`)
  }

  const handleListeningChoice = (task: MissionTask, choiceId: string) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return

    const attemptsUsed = (listeningAttempts[task.id] ?? 0) + 1
    setListeningAttempts((current) => ({ ...current, [task.id]: attemptsUsed }))

    if (choiceId !== item.id) {
      setPracticeStep('heard')
      setFeedback('还不是这个图案，再听一遍重新选。')
      return
    }

    const stars = attemptsUsed === 1 ? 3 : attemptsUsed === 2 ? 2 : 1
    const score = stars === 3 ? 100 : stars === 2 ? 78 : 60
    completeTask(task, stars, score, `选图 ${attemptsUsed} 次`)
    setPracticeStep('result')
    setPracticeFeedback({
      id: makeResultId(),
      stars,
      score,
      message: attemptsUsed === 1 ? '一次就选对啦！' : `第 ${attemptsUsed} 次选对啦！`,
    })
    setFeedback(`选对啦！${attemptsUsed === 1 ? '一次选对，获得 3 颗星！' : `第 ${attemptsUsed} 次选对，获得 ${stars} 颗星。`}`)
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
        setFeedback(item.type === 'phrase' ? `三颗星！再听一遍短句：${item.text}` : `三颗星！现在听一个完整句子：${item.prompt}`)
        window.setTimeout(() => {
          void (item.type === 'phrase' ? speakPracticeItem(item) : speakPracticeText(item.prompt))
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

  const handleSpellPractice = (task: MissionTask) => {
    const item = getItemById(task.itemId, activeCurriculum)
    if (!item) return

    const target = normalizeSpelling(item.text)
    const typed = normalizeSpelling(spellingInput)
    const correctLetters = typed.split('').filter((letter, index) => letter === target[index]).length
    const isExact = typed === target
    const score = target.length ? Math.round((correctLetters / target.length) * 100) : 0
    const stars = isExact ? 3 : score >= 80 ? 2 : score >= 55 ? 1 : 0

    if (stars <= 0) {
      setPracticeStep('heard')
      setPracticeFeedback(null)
      setFeedback(`再看一眼单词：${item.text}。你输入的是：${spellingInput || '—'}。`)
      return
    }

    completeTask(task, stars, score, spellingInput)
    setPracticeStep('result')
    setPracticeFeedback({
      id: makeResultId(),
      stars,
      score,
      transcript: spellingInput,
      message: isExact ? '每个字母都打对啦！' : `打对了 ${correctLetters}/${target.length} 个字母。`,
    })
    setFeedback(isExact ? '拼写正确，知道这个单词由哪些字母组成啦！' : `接近啦，获得 ${stars} 颗星。正确拼写是：${item.text}`)
  }

  const runTask = (task: MissionTask) => {
    setActiveTaskId(task.id)
    if (practiceStep === 'ready') return
    if (task.skill === 'listen') return
    if (task.skill === 'spell') {
      handleSpellPractice(task)
      return
    }
    void handleSpeakPractice(task)
  }

  const selectTask = (taskId: string) => {
    stopPracticeAudio()
    setActiveTaskId(taskId)
    setPracticeStep('ready')
    setPracticeFeedback(null)
    setListeningAttempts((current) => ({ ...current, [taskId]: 0 }))
    setSpellingInput('')
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
    const fieldCareRequirement = getFieldCareRequirement(currentPlot?.kind)
    const careHint = (currentPlot?.kind === 'strawberry' || currentPlot?.kind === 'wheat' || currentPlot?.kind === 'teaLeaf') && (key === 'sunlight' || key === 'raindrop')
      ? `还需要阳光 ${Math.max(0, fieldCareRequirement - (currentPlot.sunlight + (key === 'sunlight' ? 1 : 0)))} 个，雨露 ${Math.max(0, fieldCareRequirement - (currentPlot.raindrop + (key === 'raindrop' ? 1 : 0)))} 个。`
      : ''
    setFeedback(`${meta.label} 放好啦！${careHint}`)
  }

  const handleBuyShopItem = (key: InventoryKey, cost: number) => {
    const meta = inventoryCatalog[key]
    if (state.starBank < cost) {
      setFeedback(`星星还差 ${cost - state.starBank} 个。完成每日练习可以继续获得星星。`)
      return
    }
    setState((current) => buyShopItem(current, key, cost))
    showPrizePopup(key, `${meta.label} ×1`, '兑换成功！')
    void logEvent({
      type: 'shop_buy',
      deltaStars: -cost,
      itemKey: key,
      itemAmount: 1,
      detail: `兑换 ${meta.label}`,
    })
  }

  const handleCraftRecipe = (recipeId: string) => {
    const recipe = recipes.find((item) => item.id === recipeId)
    if (!recipe) return
    if (craftAnimation) {
      setFeedback('制作台正在工作，等这一份做好再开始下一份。')
      return
    }
    if (!canCraftRecipe(state, recipe)) {
      setFeedback(`材料还不够：${getMissingInputs(state, recipe)}。去花园、兑换或抽奖补充一下吧。`)
      return
    }

    const beforeUnlocked = new Set(state.unlockedCharacters)
    const animation = {
      id: makeResultId(),
      recipeId,
      recipeName: recipe.name,
      inputKeys: expandRecipeInputs(recipe.inputs),
      outputKey: recipe.output,
    }
    setCraftAnimation(animation)
    setFeedback(`${recipe.name} 制作中，请看制作台动画。`)
    craftTimerRef.current = window.setTimeout(() => {
      craftTimerRef.current = null
      finishCraftAnimation(animation, beforeUnlocked)
    }, 10000)
  }

  const handleHarvestPlot = (plot: GardenPlot) => {
    if (!plot.ready) return
    const meta = getPlotMeta(plot)
    setState((current) => harvestPlot(current, plot.id))
    showPrizePopup(meta.itemKey, `${meta.output} ×1`, '收获啦！')
    void logEvent({
      type: 'harvest',
      refId: plot.id,
      itemKey: meta.itemKey,
      itemAmount: 1,
      detail: `收获 ${meta.output} (${plot.kind})`,
    })
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
      const imported = await importGameStateFile(file, currentUser)
      setState(imported)
      setActiveTaskId(null)
      setPracticeStep('ready')
      setPracticeFeedback(null)
      setSpellingInput('')
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
  const listeningChoices = activeTask?.skill === 'listen' ? buildListeningChoices(activeItem, activeCurriculum, todayMission.date) : []
  const activeListeningAttempts = activeTask ? listeningAttempts[activeTask.id] ?? 0 : 0
  const lotteryStats = getDailyLotteryStats(todayMission)
  const lotteryStarsToNext = lotteryStats.nextTargetStars ? Math.max(lotteryStats.nextTargetStars - lotteryStats.earnedStars, 0) : 0
  const weakWords = activeCurriculum
    .filter((item) => state.mastery[item.id])
    .sort((a, b) => getMasteryScore(state.mastery[a.id]) - getMasteryScore(state.mastery[b.id]))
    .slice(0, 5)

  if (!currentUser) {
    return (
      <main className="login-shell">
        <section className="login-card card">
          <p className="eyebrow">Berry Boba English Factory</p>
          <h1>登录草莓啵啵英语工厂</h1>
          <p className="soft-text">输入一个简单账号和密码。新账号会自动创建，学习记录、每日任务、道具和花园都会按账号单独保存。</p>
          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleLogin()
            }}
          >
            <label>
              账号
              <input
                autoFocus
                type="text"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                placeholder="例如：kid01"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="至少 4 位"
              />
            </label>
            {loginMessage && <p className="login-message" aria-live="polite">{loginMessage}</p>}
            <button type="submit" className="primary-button">登录 / 创建账号</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {starBurst && <StarBurst key={starBurst.id} stars={starBurst.stars} text={starBurst.text} />}
      {prizeBurst && <PrizeBurst key={prizeBurst.id} itemKey={prizeBurst.itemKey} text={prizeBurst.text} title={prizeBurst.title} />}
      <header className="topbar">
        <div>
          <p className="eyebrow">Berry Boba English Factory</p>
          <h1>{currentUser} 的草莓啵啵英语工厂</h1>
          <div className="user-badge">当前账号：{currentUser}</div>
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
          <button className="nav-button logout-button" type="button" onClick={handleLogout}>退出</button>
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
                {activeTask.skill === 'listen' ? (
                  <div className="listening-prompt-card" aria-label="听力选图练习">
                    <span className="listening-ear" aria-hidden="true">👂</span>
                    <strong>听英文，选择正确图案</strong>
                    <small>不会显示单词图标和中文，先点“听英文”再选。</small>
                  </div>
                ) : activeTask.skill === 'spell' ? (
                  <div className="spelling-prompt-card" aria-label="实操拼写练习">
                    <WordPicture emoji={activeItem.emoji} theme={activeItem.theme} label={activeItem.text} animated />
                    <strong className="spelling-word">{activeItem.text}</strong>
                    <small>看着上面的单词，把每个字母完整打出来。</small>
                  </div>
                ) : (
                  <WordPicture emoji={activeItem.emoji} theme={activeItem.theme} label={activeItem.text} animated />
                )}
                <div className="practice-steps" aria-label="练习步骤">
                  <span className={practiceStep === 'ready' || speaking ? 'active' : ''}>1 听</span>
                  <span className={practiceStep === 'heard' && !speaking ? 'active' : ''}>2 {activeTask.skill === 'listen' ? '选图' : activeTask.skill === 'spell' ? '打字母' : '说'}</span>
                  <span className={practiceStep === 'listening' ? 'active' : ''}>3 {activeTask.skill === 'listen' ? '判断' : activeTask.skill === 'spell' ? '检查' : '识别'}</span>
                  <span className={practiceStep === 'result' ? 'active' : ''}>4 奖励</span>
                </div>
                <p className="eyebrow">{activeTask.skill === 'listen' ? '听一听，找图案' : activeTask.skill === 'spell' ? '实操拼写 · 认识单词里的每个字母' : '先听英文和中文，再勇敢开口'}</p>
                {activeTask.skill === 'speak' ? (
                  <>
                    <h2>{activeItem.text}</h2>
                    <p className="meaning">{activeItem.meaning}</p>
                    <p className="soft-text">{activeItem.prompt}</p>
                  </>
                ) : activeTask.skill === 'spell' ? (
                  <div className="spelling-input-panel">
                    <h2>{activeItem.text}</h2>
                    <p className="meaning">{activeItem.meaning}</p>
                    <label>
                      完整输入字母
                      <input
                        autoComplete="off"
                        autoCorrect="off"
                        disabled={speaking || listening || practiceStep === 'ready' || practiceStep === 'result'}
                        inputMode="text"
                        spellCheck={false}
                        type="text"
                        value={spellingInput}
                        onChange={(event) => setSpellingInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && practiceStep !== 'ready' && practiceStep !== 'result') runTask(activeTask)
                        }}
                        placeholder={`例如：${activeItem.text}`}
                      />
                    </label>
                    <small>可以看着单词慢慢打，重点是记住顺序：{activeItem.text.split('').join(' · ')}</small>
                  </div>
                ) : (
                  <div className="listening-choice-grid" aria-label="听力图案选项">
                    {listeningChoices.map((choice) => (
                      <button
                        className="listening-choice-card"
                        disabled={speaking || listening || practiceStep === 'ready' || practiceStep === 'result'}
                        key={choice.id}
                        type="button"
                        aria-label={`选择图案 ${choice.text}`}
                        onClick={() => handleListeningChoice(activeTask, choice.id)}
                      >
                        <WordPicture emoji={choice.emoji} theme={choice.theme} label="候选图案" small />
                      </button>
                    ))}
                    <small className="hidden-answer-note">已尝试 {activeListeningAttempts} 次：一次选对 3 星，第二次选对 2 星，三次以上选对 1 星。</small>
                  </div>
                )}
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
                      ? practiceStep === 'result' ? '已完成' : practiceStep === 'ready' ? '先听英文' : '请选择图案'
                      : activeTask.skill === 'spell'
                        ? practiceStep === 'result' ? '已完成' : practiceStep === 'ready' ? '先听再打' : '⌨️ 检查字母'
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
                    {activeTask.skill === 'listen' && (
                      <div className="listening-result-word">
                        <WordPicture emoji={activeItem.emoji} theme={activeItem.theme} label={activeItem.text} small />
                        <div className="listening-result-text">
                          <strong className="result-word-en">{activeItem.text}</strong>
                          <span className="result-word-cn">{activeItem.meaning}</span>
                          <button type="button" className="ghost-button" disabled={speaking || listening} onClick={() => void speakPracticeText(activeItem.text)}>
                            🔊 再听一遍
                          </button>
                        </div>
                      </div>
                    )}
                    <small>{activeTask.skill === 'listen' ? `选图次数：${activeListeningAttempts || 1}` : activeTask.skill === 'spell' ? `你输入：${practiceFeedback.transcript || '—'}` : `我听到：${practiceFeedback.transcript || '—'}`}</small>
                    {practiceFeedback.stars >= 3 && (
                      <em>
                        {activeTask.skill === 'speak' && (
                          <>
                            机器正在读{activeItem.type === 'phrase' ? '短句' : '完整句'}：{activeItem.type === 'phrase' ? activeItem.text : activeItem.prompt}
                            <button type="button" disabled={speaking || listening} onClick={() => void (activeItem.type === 'phrase' ? speakPracticeItem(activeItem) : speakPracticeText(activeItem.prompt))}>
                              🔊 再听一遍
                            </button>
                          </>
                        )}
                      </em>
                    )}
                    <div className="result-actions">
                      <button type="button" className="primary-button" disabled={listening || speaking} onClick={moveToNextTask}>
                        下一题
                      </button>
                    </div>
                  </div>
                )}
                {activeTask.skill === 'speak' && !isSpeechRecognitionSupported() && (
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
                  {item && task.skill !== 'listen' ? <WordPicture emoji={item.emoji} theme={item.theme} label={item.text} small /> : <span className="task-listen-icon" aria-hidden="true">👂</span>}
                  <span className="task-index">{todayMission.tasks.indexOf(task) + 1}</span>
                  <strong>{task.skill === 'listen' ? '听音选图' : task.skill === 'spell' ? '实操拼写' : item?.text}</strong>
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
          <h2>所有材料都在这里</h2>
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
            <button type="button" className="slot-lever" aria-label="抽奖拉杆" disabled={lotteryStats.remainingDraws <= 0 || slotRolling} onClick={handleLottery}>
              <span />
            </button>
          </div>
          <div className="mix-panel lottery-panel">
            <div>
              <h3>{slotRolling ? '咕噜咕噜滚动中...' : lotteryStats.remainingDraws > 0 ? `今天还能抽 ${lotteryStats.remainingDraws} 次` : '先攒当天星星'}</h3>
              <p className="soft-text">
                今天任务星星 {lotteryStats.earnedStars} 个：10 星抽 1 次，20 星抽 2 次，30 星抽 3 次；已抽 {lotteryStats.claimedDraws}/{lotteryStats.availableDraws} 次，当天有效。
                {lotteryStats.remainingDraws > 0 ? ' 可能掉落草莓种子、小麦种子、茶叶种子、阳光、雨露、小鸡或工厂材料；牛奶概率最低，但最多 10 抽必得 1 次。' : lotteryStarsToNext > 0 ? ` 还差 ${lotteryStarsToNext} 星获得下一次抽奖。` : ' 今天 3 次机会已达上限。'}
              </p>
            </div>
            <button type="button" className="primary-button" disabled={lotteryStats.remainingDraws <= 0 || slotRolling} onClick={handleLottery}>
              {slotRolling ? '正在摇...' : lotteryStats.remainingDraws > 0 ? `摇一下（剩 ${lotteryStats.remainingDraws} 次）` : lotteryStats.availableDraws >= 3 ? '今天已抽完' : '先获得 10 星'}
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
          {craftAnimation && <CraftingStage animation={craftAnimation} />}
          <div className="recipe-grid">
            {recipes.map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <ItemIcon itemKey={recipe.output} />
                <h3>{recipe.name}</h3>
                <p>{recipe.description}</p>
                <RecipeIngredientIcons inputs={recipe.inputs} />
                {!canCraftRecipe(state, recipe) && <small className="missing-text">还差：{getMissingInputs(state, recipe)}</small>}
                <button type="button" className="ghost-button" disabled={!canCraftRecipe(state, recipe) || Boolean(craftAnimation)} onClick={() => handleCraftRecipe(recipe.id)}>
                  {craftAnimation?.recipeId === recipe.id ? '制作中...' : canCraftRecipe(state, recipe) ? '开始制作' : '材料不足'}
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
                  <button type="button" className="ghost-button" disabled={speaking} onClick={() => void speakPracticeItem(selectedWord)}>
                    试听英文和中文
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

          <h3>游戏流水日志</h3>
          <div className="event-log-box">
            {eventLog.length ? eventLog.slice(0, 100).map((entry) => (
              <div key={entry.seq} className="event-log-row">
                <span className="event-log-time">{entry.createdAt.slice(5, 16).replace('T', ' ')}</span>
                <span className={`event-log-type event-type-${entry.type}`}>{eventLabel[entry.type] ?? entry.type}</span>
                {entry.deltaStars !== 0 && (
                  <span className={entry.deltaStars > 0 ? 'event-log-gain' : 'event-log-spend'}>
                    {entry.deltaStars > 0 ? '+' : ''}{entry.deltaStars} ⭐
                  </span>
                )}
                {entry.itemKey && entry.itemAmount > 0 && (
                  <span className="event-log-item">
                    {inventoryCatalog[entry.itemKey as InventoryKey]?.emoji ?? '🎁'} {inventoryCatalog[entry.itemKey as InventoryKey]?.label ?? entry.itemKey} ×{entry.itemAmount}
                  </span>
                )}
                {entry.detail && <span className="event-log-detail">{entry.detail}</span>}
              </div>
            )) : <p className="soft-text">暂无流水记录。练习、兑换、抽奖、制作、收获都会记录在这里。</p>}
          </div>

          <h3>每日快照</h3>
          <p className="soft-text">每天自动保存一份完整物品状态快照（当天最新），可用于数据恢复。</p>
          <div className="snapshot-list">
            {snapshots.length ? snapshots.map((snap) => (
              <div
                key={snap.date}
                className={`snapshot-card${snapshotDetailDate === snap.date ? ' active' : ''}`}
                onClick={async () => {
                  if (snapshotDetailDate === snap.date) {
                    setSnapshotDetailDate(null)
                    setSnapshotDetail(null)
                    return
                  }
                  setSnapshotDetailDate(snap.date)
                  setSnapshotDetail(null)
                  const detail = await getSnapshotDetail(snap.date, currentUser)
                  setSnapshotDetail(detail.snapshot)
                }}
              >
                <div className="snapshot-card-header">
                  <strong>{snap.date}</strong>
                  <span className="snapshot-time">{snap.createdAt.slice(11, 16)}</span>
                </div>
                <div className="snapshot-card-body">
                  <span>⭐ {snap.totalStars}</span>
                  <span>🏦 {snap.starBank}</span>
                  <span>📝 {snap.resultsCount}</span>
                  <span>📖 {snap.masteryCount}</span>
                </div>
                <div className="snapshot-card-garden">
                  {snap.gardenPlots.filter((k) => k !== 'empty').join(' / ') || '空花园'}
                </div>
              </div>
            )) : <p className="soft-text">暂无快照。下次保存数据时会自动生成。</p>}
          </div>

          {snapshotDetailDate && snapshotDetail && (
            <div className="snapshot-detail">
              <h4>快照详情 · {snapshotDetailDate}</h4>
              <div className="snapshot-detail-grid">
                <div><strong>累计星星</strong> {String(snapshotDetail.totalStars ?? 0)}</div>
                <div><strong>可用星星</strong> {String(snapshotDetail.starBank ?? 0)}</div>
                <div><strong>连续天数</strong> {String(snapshotDetail.streak ?? 0)}</div>
                <div><strong>啵啵杯</strong> {String(snapshotDetail.bobaCups ?? 0)}</div>
                <div><strong>蛋挞</strong> {String(snapshotDetail.eggTarts ?? 0)}</div>
                <div><strong>招待点数</strong> {String(snapshotDetail.treatPoints ?? 0)}</div>
              </div>
              <h4>仓库物品</h4>
              <div className="snapshot-inventory">
                {Object.entries((snapshotDetail.inventory ?? {}) as Record<string, number>)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <span key={k} className="snapshot-inv-item">
                      {inventoryCatalog[k as InventoryKey]?.emoji ?? '📦'} {inventoryCatalog[k as InventoryKey]?.label ?? k} ×{v}
                    </span>
                  ))}
              </div>
              <h4>花园</h4>
              <div className="snapshot-garden">
                {((snapshotDetail.gardenPlots ?? []) as GardenPlot[]).map((p, i) => (
                  <span key={i} className="snapshot-garden-plot">
                    {p.kind === 'empty' ? '⬜' : (inventoryCatalog[p.kind as InventoryKey]?.emoji ?? '🌱')} {p.kind}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="hero-actions">
            <button type="button" className="ghost-button" onClick={() => {
              void getEventLog(currentUser).then(setEventLog)
              void getSnapshots(currentUser).then(setSnapshots)
              setFeedback('流水和快照已刷新。')
            }}>
              刷新流水
            </button>
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
              onClick={async () => {
                if (window.confirm('确定要清空当前账号的所有学习记录吗？')) {
                  if (window.confirm('此操作不可撤销，将删除所有星星、仓库、花园、任务和练习记录。再次确认要清空吗？')) {
                    const freshState = await resetGameState(currentUser)
                    setState({
                      ...freshState,
                      missions: [generateDailyMission(freshState)],
                    })
                  }
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
              <button type="button" className="ghost-button" onClick={() => {
                if (window.confirm('确定要清空自定义词库吗？')) {
                  if (window.confirm('此操作将删除所有已导入的自定义词条，不可撤销。再次确认要清空吗？')) {
                    setState((current) => ({ ...current, customCurriculum: [] }))
                  }
                }
              }}>
                清空自定义词库
              </button>
            </div>
            <p className="soft-text">自定义词库格式：JSON 数组，至少包含 text 和 meaning，可选 theme、level、emoji、prompt、difficulty、priority。</p>
          </section>
          <p className="soft-text">
            词库、画像和学习记录都保存在数据库中，按天分表存储并记录流水。建议定期导出 JSON 备份。
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

const eventLabel: Record<string, string> = {
  practice_stars: '练习得星',
  lottery: '抽奖',
  shop_buy: '兑换',
  craft: '制作',
  harvest: '收获',
}

const skillLabel: Record<SkillType, string> = {
  listen: '听力',
  speak: '口语',
  spell: '实操',
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

function expandRecipeInputs(inputs: (typeof recipes)[number]['inputs']) {
  return Object.entries(inputs).flatMap(([key, amount]) =>
    Array.from({ length: amount ?? 0 }).map(() => key as InventoryKey),
  )
}

function RecipeIngredientIcons({ inputs }: { inputs: (typeof recipes)[number]['inputs'] }) {
  return (
    <div className="recipe-ingredients" aria-label="制作材料">
      {Object.entries(inputs).map(([key, amount]) => {
        const itemKey = key as InventoryKey
        return (
          <div className="recipe-ingredient-group" key={key} aria-label={`${inventoryCatalog[itemKey].label} ${amount} 个`}>
            {Array.from({ length: amount ?? 0 }).map((_, index) => (
              <ItemIcon key={index} itemKey={itemKey} className="recipe-ingredient-icon" />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function CraftingStage({ animation }: { animation: CraftAnimation }) {
  return (
    <div className="crafting-stage" aria-live="polite">
      <div className="crafting-machine">
        <div className="crafting-inputs" aria-label="投入材料">
          {animation.inputKeys.map((key, index) => (
            <ItemIcon key={`${key}-${index}`} itemKey={key} className="crafting-flow-icon" />
          ))}
        </div>
        <div className="crafting-core" aria-hidden="true">
          <UiIcon iconKey="factory" label="工厂" className="crafting-factory-icon" />
          <span className="crafting-gear gear-a">✦</span>
          <span className="crafting-gear gear-b">✧</span>
        </div>
        <div className="crafting-output" aria-label="目标成品">
          <ItemIcon itemKey={animation.outputKey} className="crafting-result-icon" />
        </div>
      </div>
      <div className="crafting-progress"><span /></div>
      <strong>{animation.recipeName} 制作中...</strong>
      <small>材料正在进入机器，约 10 秒后完成。</small>
    </div>
  )
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
    if (plot.kind === 'empty' && key === 'teaLeafSeed') {
      return (current: GameState) => plantInPlot(current, plot.id, 'teaLeaf')
    }
    if ((plot.kind === 'strawberry' || plot.kind === 'wheat' || plot.kind === 'teaLeaf') && (key === 'sunlight' || key === 'raindrop')) {
      const fieldCareRequirement = getFieldCareRequirement(plot.kind)
      if (key === 'sunlight' && plot.sunlight >= fieldCareRequirement) return null
      if (key === 'raindrop' && plot.raindrop >= fieldCareRequirement) return null
      return (current: GameState) => careForPlot(current, plot.id, key)
    }
  }

  if (zone === 'coop') {
    if ((plot.kind === 'empty' || plot.kind === 'chicken') && key === 'chicken' && (plot.chickens ?? 0) < 3) {
      return (current: GameState) => plantInPlot(current, plot.id, 'chicken')
    }
    if (plot.kind === 'chicken' && key === 'chickenFeed') {
      const eggCounts = plot.chickenEggs ?? Array.from({ length: plot.chickens ?? 1 }).map(() => 0)
      if (plot.ready || eggCounts.every((eggCount) => eggCount >= 3)) return null
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
  if (plot.kind === 'chicken') {
    const eggCounts = plot.chickenEggs ?? Array.from({ length: plot.chickens ?? 1 }).map(() => 0)
    return plot.ready ? '小鸡下蛋啦，点击收获。' : `拖小鸡或鸡食料到这里，当前 ${plot.chickens ?? 1}/3 只，产蛋进度 ${eggCounts.join('/') || 0}/3。`
  }
  if (plot.kind === 'strawberry' || plot.kind === 'wheat' || plot.kind === 'teaLeaf') {
    const fieldCareRequirement = getFieldCareRequirement(plot.kind)
    return plot.ready ? '已经长大啦，点击收获。' : `需要 ${fieldCareRequirement} 个阳光和 ${fieldCareRequirement} 个雨露。`
  }
  return '等待放入材料。'
}

function getShortPlotHint(plot: GardenPlot, zone: GardenZone) {
  if (plot.kind === 'empty' && zone === 'field') return '放种子'
  if (plot.kind === 'empty' && zone === 'coop') return '放小鸡'
  if (plot.kind === 'chicken') return plot.ready ? '可收蛋' : `${plot.chickens ?? 1}/3 小鸡`
  if (plot.kind === 'strawberry' || plot.kind === 'wheat' || plot.kind === 'teaLeaf') return plot.ready ? '可收获' : ''
  return '拖到这里'
}

function getPlotMeta(plot: GardenPlot, zone?: GardenZone): { itemKey?: InventoryKey; label: string; output: string } {
  if (plot.kind === 'strawberry') return { itemKey: plot.ready ? 'strawberry' : 'strawberrySeed', label: '草莓地', output: '草莓' }
  if (plot.kind === 'wheat') return { itemKey: plot.ready ? 'wheat' : 'wheatSeed', label: '小麦地', output: '小麦' }
  if (plot.kind === 'teaLeaf') return { itemKey: plot.ready ? 'teaLeaf' : 'teaLeafSeed', label: '茶地', output: '茶叶' }
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
          <small>{meta.source}</small>
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

function FieldPlotIcon({ kind, ready }: { kind: 'strawberry' | 'wheat' | 'teaLeaf'; ready: boolean }) {
  const fieldSrc = kind === 'strawberry' ? '/items/草莓地.png' : kind === 'wheat' ? '/items/小麦地.png' : '/items/茶地.png'
  const fallbackKey: InventoryKey = kind === 'strawberry'
    ? ready ? 'strawberry' : 'strawberrySeed'
    : kind === 'wheat'
      ? ready ? 'wheat' : 'wheatSeed'
      : ready ? 'teaLeaf' : 'teaLeafSeed'
  const fallbackSrc = inventoryCatalog[fallbackKey].iconSrc ?? ''
  const label = kind === 'strawberry' ? '草莓地' : kind === 'wheat' ? '小麦地' : '茶地'

  return (
    <div className={`item-icon icon-${fallbackKey} plot-item-icon field-plot-icon`} aria-label={`${label}图标`} role="img">
      <img
        src={fieldSrc}
        alt=""
        onError={(event) => {
          event.currentTarget.onerror = null
          event.currentTarget.src = fallbackSrc
        }}
      />
    </div>
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
  if (plot.kind === 'strawberry') return <FieldPlotIcon kind="strawberry" ready={plot.ready} />
  if (plot.kind === 'wheat') return <FieldPlotIcon kind="wheat" ready={plot.ready} />
  if (plot.kind === 'teaLeaf') return <FieldPlotIcon kind="teaLeaf" ready={plot.ready} />
  return null
}

function renderPlotStatus(plot: GardenPlot, zone: GardenZone) {
  if (plot.kind === 'empty' && zone === 'field') {
    return (
      <>
        <ItemIcon itemKey="strawberrySeed" className="mini-status-icon" />
        <ItemIcon itemKey="wheatSeed" className="mini-status-icon" />
        <ItemIcon itemKey="teaLeafSeed" className="mini-status-icon" />
      </>
    )
  }

  if (plot.kind === 'empty' && zone === 'coop') {
    return <ItemIcon itemKey="chicken" className="mini-status-icon" />
  }

  if (plot.kind === 'chicken') {
    const eggCounts = (plot.chickenEggs ?? Array.from({ length: plot.chickens ?? 1 }).map(() => 0)).slice(0, plot.chickens ?? 1)
    return (
      <>
        {plot.ready ? <ItemIcon itemKey="egg" className="mini-status-icon" /> : <ItemIcon itemKey="chickenFeed" className="mini-status-icon" />}
        {(plot.chickens ?? 1) < 3 && <ItemIcon itemKey="chicken" className="mini-status-icon" />}
        <span className="egg-cycle-status">{eggCounts.map((count) => `${count}/3`).join(' · ')}</span>
      </>
    )
  }

  if (plot.kind === 'strawberry' || plot.kind === 'wheat' || plot.kind === 'teaLeaf') {
    const fieldCareRequirement = getFieldCareRequirement(plot.kind)
    return (
      <div className="plot-growth-needs" aria-label={`需要阳光 ${fieldCareRequirement} 个、雨露 ${fieldCareRequirement} 个`}>
        {Array.from({ length: fieldCareRequirement }).map((_, index) => (
          <ItemIcon key={`sun-${index}`} itemKey="sunlight" className={`growth-need-icon ${plot.sunlight > index ? 'done' : ''}`} />
        ))}
        {Array.from({ length: fieldCareRequirement }).map((_, index) => (
          <ItemIcon key={`rain-${index}`} itemKey="raindrop" className={`growth-need-icon ${plot.raindrop > index ? 'done' : ''}`} />
        ))}
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
