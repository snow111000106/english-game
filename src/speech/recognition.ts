import { scoreSpeech } from './scoring'
import { stopSpeaking } from './tts'

type SpeechRecognitionConstructor = new () => SpeechRecognition

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative
  isFinal: boolean
  length: number
}

interface SpeechRecognitionResultList {
  0: SpeechRecognitionResult
  length: number
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export const isSpeechRecognitionSupported = () =>
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

export const listenAndScore = (target: string) =>
  new Promise<ReturnType<typeof scoreSpeech>>((resolve, reject) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      reject(new Error('这个浏览器暂时不支持语音识别，请使用 Chrome 或 Edge。'))
      return
    }

    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    let settled = false
    let timeoutId = 0

    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      callback()
    }

    recognition.onresult = (event) => {
      const alternative = event.results[0][0]
      settle(() => resolve(scoreSpeech(target, alternative.transcript, alternative.confidence)))
      recognition.stop()
    }

    recognition.onerror = (event) => {
      settle(() => reject(new Error(event.error || '语音识别失败，请再试一次。')))
    }

    recognition.onend = () => {
      if (!settled) {
        settle(() => resolve(scoreSpeech(target, '', 0)))
      }
    }

    stopSpeaking()
    timeoutId = window.setTimeout(() => {
      if (!settled) recognition.stop()
    }, 6500)
    window.setTimeout(() => recognition.start(), 180)
  })
