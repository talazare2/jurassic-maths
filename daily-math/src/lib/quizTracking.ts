/** Automatic anonymous tracking. No student accounts, codes, or identity form. */
const BROWSER_KEY = 'jurassic-maths-browser-id-v1'
const QUEUE_KEY = 'jurassic-maths-unsent-events-v1'
const memory: {browserId: string, queue: QueuedEvent[]} = { browserId: '', queue: [] }
export type TrackingEvent = {
  visitorId: string
  attemptId: string
  quizKey: string
  questionId?: string
  answer?: string
}
type QueuedEvent = { path: '/api/attempt/start' | '/api/attempt/answer', body: TrackingEvent }
let flushing: Promise<boolean> | undefined

function uuid(): string {
  return crypto.randomUUID()
}
export function newAttemptId(): string { return uuid() }

export function getBrowserId(): string {
  if (memory.browserId) return memory.browserId
  try {
    const old = localStorage.getItem(BROWSER_KEY)
    if (old && /^[a-zA-Z0-9_-]{10,100}$/.test(old)) return (memory.browserId = old)
    const fresh = uuid()
    localStorage.setItem(BROWSER_KEY, fresh)
    return (memory.browserId = fresh)
  } catch { return (memory.browserId = uuid()) }
}
function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : []
  } catch { return memory.queue }
}
function writeQueue(queue: QueuedEvent[]) {
  const limited = queue.slice(-500)
  memory.queue = limited
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(limited)) } catch { /* Private mode */ }
}
async function flush(): Promise<boolean> {
  if (flushing) return flushing
  flushing = (async () => {
    for (;;) {
      const queue = readQueue()
      if (!queue.length) return true
      const item = queue[0]
      try {
        const response = await fetch(item.path, {
          method: 'POST', credentials: 'same-origin', keepalive: true,
          headers: {'Content-Type': 'application/json'}, body: JSON.stringify(item.body),
        })
        // Vite without an API proxy may return HTML with status 200; reject it.
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false
        const data = await response.json() as {ok?:boolean}
        if (!data.ok) return false
        writeQueue(readQueue().slice(1))
      } catch { return false }
    }
  })()
  try { return await flushing }
  finally { flushing = undefined }
}
async function queueEvent(path: QueuedEvent['path'], body: TrackingEvent): Promise<boolean> {
  const queued = readQueue()
  // React StrictMode may call the start effect twice: don't enqueue duplicates.
  if (!queued.some(e => e.path === path && e.body.attemptId === body.attemptId &&
      e.body.questionId === body.questionId)) {
    queued.push({path, body})
    writeQueue(queued)
  }
  return flush()
}
export function startAttempt(quizKey: string, attemptId: string): Promise<boolean> {
  return queueEvent('/api/attempt/start', {quizKey, attemptId, visitorId:getBrowserId()})
}
export function recordAnswer(quizKey: string, attemptId: string, questionId: string, answer: string): Promise<boolean> {
  return queueEvent('/api/attempt/answer', {quizKey, attemptId, visitorId:getBrowserId(), questionId, answer})
}
export function setUpTrackingRetries(): () => void {
  const retry = () => { void flush() }
  window.addEventListener('online', retry)
  const interval = window.setInterval(retry, 30_000)
  retry()
  return () => { window.removeEventListener('online', retry); window.clearInterval(interval) }
}
