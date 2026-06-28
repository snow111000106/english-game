export const stopSpeaking = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export const speakText = (text: string, lang = 'en-US') => {
  if (!('speechSynthesis' in window)) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve(ok)
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = lang.startsWith('zh') ? 0.92 : 0.82
    utterance.pitch = lang.startsWith('zh') ? 1.22 : 1.08
    const timeoutId = window.setTimeout(() => finish(false), Math.max(5000, text.length * 420))
    utterance.onend = () => finish(true)
    utterance.onerror = () => finish(false)

    window.speechSynthesis.speak(utterance)
  })
}
