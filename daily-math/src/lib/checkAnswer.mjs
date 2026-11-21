// Shared by the browser and the server. Never evaluate student text as JavaScript.
export function normalizeAnswer(value) {
  return String(value).trim().toLocaleLowerCase('fr-FR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[×·]/g, '*').replace(/\s+/g, '')
}
export function asNumber(value) {
  const s = String(value).trim()
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(s)) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
export function isAnswerCorrect(answer, question) {
  const candidates = [question.answer, ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [])]
  return candidates.some(expected => {
    const expectedNumber = asNumber(expected)
    const actualNumber = asNumber(answer)
    if (expectedNumber !== null && actualNumber !== null) return expectedNumber === actualNumber
    return normalizeAnswer(answer) === normalizeAnswer(expected)
  })
}
