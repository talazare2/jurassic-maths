// Jurassic Maths: same-origin backend + Neon Postgres for one-student tracking.
// Install dependency: npm install pg
// Run locally: node --env-file=.env server/index.mjs (Node >= 20.6).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { isAnswerCorrect } from '../src/lib/checkAnswer.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const QUIZZES_PATH = path.join(ROOT, 'src', 'data', 'quizzes.json')
const DATABASE_URL = process.env.DATABASE_URL || ''
const PORT = Number(process.env.PORT || 3001)
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' // ONLY if behind a trusted proxy.
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const RETENTION_DAYS = Math.max(1, Number(process.env.RETENTION_DAYS || 90))
const PASSWORD = process.env.ADMIN_PASSWORD || ''
if (PASSWORD.length < 12 || PASSWORD.startsWith('REPLACE_WITH_')) {
  console.error('Set ADMIN_PASSWORD (minimum 12 characters) in .env before starting the server.')
  process.exit(1)
}
if (!/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
  console.error('Set DATABASE_URL to the Neon PostgreSQL connection string before starting.')
  process.exit(1)
}
const pool = new pg.Pool({
  connectionString: DATABASE_URL, max: 3,
  connectionTimeoutMillis: 20000, idleTimeoutMillis: 30000,
})
pool.on('error', e => console.error('Neon idle connection issue:', e.message))
const SESSION_MS = 12 * 60 * 60 * 1000
const sessions = new Map() // SHA-256(token) -> expiration timestamp; cleared on restart.
const loginFailures = new Map()
const writeBudgets = new Map()


function getIp(req) {
  const forwarded = TRUST_PROXY ? req.headers['x-forwarded-for'] : undefined
  const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return String(candidate || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '').slice(0, 100)
}
function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}
function error(status, message) { const e = new Error(message); e.status = status; return e }
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // Non-browser clients; admin still requires a session.
  try {
    const expected = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin :
      `${IS_PRODUCTION ? 'https' : 'http'}://${req.headers.host}`
    return new URL(origin).origin === expected
  } catch { return false }
}
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, 'JSON required')
  let text = ''
  for await (const chunk of req) {
    text += chunk.toString('utf8')
    if (text.length > 12000) throw error(413, 'Request too large')
  }
  try { return JSON.parse(text) } catch { throw error(400, 'Invalid JSON') }
}
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex') }
function equalSecret(a, b) {
  return crypto.timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)))
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(s => s.trim().split(/=(.*)/s).slice(0, 2)).filter(pair => pair.length === 2))
}
function authorized(req) {
  const token = cookies(req).jurassic_admin
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false
  const expiry = sessions.get(sha(token))
  if (!expiry) return false
  if (expiry <= Date.now()) { sessions.delete(sha(token)); return false }
  return true
}
function requireAdmin(req) { if (!authorized(req)) throw error(401, 'Teacher login required') }
function sessionCookie(token, maxAge) {
  return `jurassic_admin=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${IS_PRODUCTION ? '; Secure' : ''}`
}
function rateLimit(map, key, max, durationMs) {
  const now = Date.now()
  let item = map.get(key)
  if (!item || now > item.until) item = { count: 0, until: now + durationMs }
  item.count += 1
  map.set(key, item)
  if (map.size > 2000) for (const [k, v] of map) if (v.until < now) map.delete(k)
  if (item.count > max) throw error(429, 'Too many requests; try later')
}
function readQuiz() {
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(QUIZZES_PATH, 'utf8')) }
  catch { throw error(503, 'Quiz JSON is missing on server') }
  const quiz = parsed.quizzes?.[0]
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) throw error(503, 'Quiz is not configured')
  const quizKey = typeof quiz.id === 'string' && quiz.id.trim() ? quiz.id : String(quiz.title || 'jurassic-maths')
  return { quiz, quizKey }
}
// Each attempt is stored as a JSONB document. Transactional row locks prevent
// lost answers on concurrent requests and duplicate deliveries from the browser.
async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS homework_attempts (
    attempt_id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    quiz_key TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL
  )`)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_homework_started_at ON homework_attempts(started_at DESC)')
}
async function getDb() {
  // Keep just the last RETENTION_DAYS days, even if there was no traffic for a while.
  await pool.query(`DELETE FROM homework_attempts
    WHERE started_at < NOW() - ($1::integer * INTERVAL '1 day')`, [RETENTION_DAYS])
  const result = await pool.query('SELECT payload FROM homework_attempts ORDER BY started_at DESC')
  return {attempts: result.rows.map(row => row.payload)}
}

const validId = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{10,100}$/.test(v)
function checkedIdentity(body) {
  if (!body || !validId(body.visitorId) || !validId(body.attemptId) ||
      typeof body.quizKey !== 'string' || body.quizKey.length > 200) throw error(400, 'Invalid attempt data')
  const { quiz, quizKey } = readQuiz()
  if (body.quizKey !== quizKey) throw error(400, 'Unknown quiz')
  return { quiz, quizKey }
}
function makeAttempt(body, ip, quiz, quizKey) {
  const now = new Date().toISOString()
  return {
    attemptId: body.attemptId, visitorId: body.visitorId, quizKey,
    quizTitle: String(quiz.title || quizKey).slice(0, 200),
    totalQuestions: quiz.questions.length, startedAt: now, lastSeenAt: now,
    completedAt: null, firstIp: ip, lastIp: ip, answers: {},
  }
}
async function persistAttempt(body, ip, quiz, quizKey, answerInfo = null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // If start and answer arrive out of order, the answer can still create its
    // attempt. Retried events remain idempotent because attempt_id is unique.
    const initial = makeAttempt(body, ip, quiz, quizKey)
    await client.query(`INSERT INTO homework_attempts
      (attempt_id, visitor_id, quiz_key, started_at, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (attempt_id) DO NOTHING`, [
      body.attemptId, body.visitorId, quizKey, initial.startedAt,
      JSON.stringify(initial),
    ])
    const existing = await client.query(
      'SELECT payload FROM homework_attempts WHERE attempt_id = $1 FOR UPDATE',
      [body.attemptId],
    )
    const attempt = existing.rows[0]?.payload
    if (!attempt || attempt.visitorId !== body.visitorId || attempt.quizKey !== quizKey) {
      throw error(403, 'Attempt mismatch')
    }
    attempt.lastSeenAt = new Date().toISOString()
    attempt.lastIp = ip
    if (answerInfo && !attempt.answers[answerInfo.questionId] && !attempt.completedAt) {
      attempt.answers[answerInfo.questionId] = {
        correct: answerInfo.correct, answeredAt: new Date().toISOString(),
        submittedAnswer: answerInfo.submittedAnswer,
        expectedAnswer: answerInfo.expectedAnswer,
        statement: answerInfo.statement,
        order: answerInfo.order,
      }
      if (Object.keys(attempt.answers).length === attempt.totalQuestions) {
        attempt.completedAt = new Date().toISOString()
      }
    }
    await client.query('UPDATE homework_attempts SET payload = $2::jsonb WHERE attempt_id = $1', [
      body.attemptId, JSON.stringify(attempt),
    ])
    await client.query('COMMIT')
    return attempt
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (rollbackError) { console.error('Rollback failed:', rollbackError) }
    throw e
  } finally {
    client.release()
  }
}

function summary(db) {
  const attempts = db.attempts.map(attempt => {
    const answers = Object.entries(attempt.answers).map(([questionId, answer]) => ({ questionId, ...answer }))
    const score = answers.filter(a => a.correct).length
    return {
      attemptId: attempt.attemptId, visitorId: attempt.visitorId,
      ip: attempt.lastIp, firstIp: attempt.firstIp,
      quizKey: attempt.quizKey, quizTitle: attempt.quizTitle,
      startedAt: attempt.startedAt, lastSeenAt: attempt.lastSeenAt,
      completedAt: attempt.completedAt, totalQuestions: attempt.totalQuestions,
      answeredCount: answers.length, score,
      answers: answers.sort((a, b) => a.order - b.order),
    }
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return { attempts, retentionDays: RETENTION_DAYS }
}
function csvField(value) {
  let str = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(str)) str = "'" + str // Spreadsheet formula injection defense.
  return `"${str.replaceAll('"', '""')}"`
}
function toCsv(attempts) {
  const cols = ['Date de début', 'Date de fin', 'Statut', 'Adresse IP', 'ID navigateur',
    'Devoir', 'Réponses', 'Questions', 'Score', 'Pourcentage', 'Détail des réponses']
  const rows = attempts.map(a => [a.startedAt, a.completedAt || '', a.completedAt ? 'Terminé' : 'En cours',
    a.ip, a.visitorId, a.quizTitle, a.answeredCount, a.totalQuestions, a.score,
    a.totalQuestions ? Math.round(100 * a.score / a.totalQuestions) : 0,
    a.answers.map(x => `Q${x.order}: ${x.submittedAnswer ?? 'non conservée'} / ${x.expectedAnswer ?? '?'} (${x.correct ? 'juste' : 'faux'})`).join(' | ')])
  return '\ufeff' + [cols, ...rows].map(row => row.map(csvField).join(',')).join('\r\n')
}
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}
function serveFile(req, res, pathname) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw error(503, 'Run npm run build first (dist/ not found)')
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { throw error(400, 'Bad URL') }
  const relative = decoded === '/' ? '/index.html' : decoded
  const requested = path.resolve(DIST, '.' + relative)
  if (requested !== DIST && !requested.startsWith(DIST + path.sep)) throw error(403, 'Forbidden path')
  const target = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(DIST, 'index.html')
  const stat = fs.statSync(target)
  const mime = MIME[path.extname(target)] || 'application/octet-stream'
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' }
  let start = 0, end = stat.size - 1, status = 200
  const range = req.headers.range
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range))
    if (!match) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end() }
    if (match[1] === '' && match[2] === '') { res.writeHead(416); return res.end() }
    if (match[1] === '') {
      const suffix = Number(match[2]); start = Math.max(0, stat.size - suffix)
    } else start = Number(match[1])
    if (match[1] !== '' && match[2] !== '') end = Number(match[2])
    if (start >= stat.size || end < start) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end() }
    end = Math.min(end, stat.size - 1); status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
  }
  headers['Content-Length'] = end - start + 1
  res.writeHead(status, headers)
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(target, { start, end }).pipe(res)
}
async function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  const {pathname} = new URL(req.url || '/', 'http://placeholder.local')
  const method = req.method || 'GET'
  if (pathname.startsWith('/api/')) {
    if (method === 'POST' && !sameOrigin(req)) throw error(403, 'Cross-origin request rejected')
    if (pathname === '/api/health' && method === 'GET') return json(res, 200, {ok:true})
    if (pathname === '/api/admin/status' && method === 'GET') return json(res, 200, {loggedIn:authorized(req)})
    if (pathname === '/api/admin/login' && method === 'POST') {
      const ip = getIp(req)
      rateLimit(loginFailures, `login:${ip}`, 10, 15 * 60_000)
      const body = await readBody(req)
      if (typeof body?.password !== 'string' || !equalSecret(body.password, PASSWORD)) throw error(401, 'Incorrect password')
      loginFailures.delete(`login:${ip}`)
      const token = crypto.randomBytes(32).toString('hex')
      sessions.set(sha(token), Date.now() + SESSION_MS)
      return json(res, 200, {ok:true}, {'Set-Cookie':sessionCookie(token, 43200)})
    }
    if (pathname === '/api/admin/logout' && method === 'POST') {
      const token = cookies(req).jurassic_admin
      if (token) sessions.delete(sha(token))
      return json(res, 200, {ok:true}, {'Set-Cookie':sessionCookie('', 0)})
    }
    if (pathname === '/api/admin/results' && method === 'GET') {
      requireAdmin(req)
      const db = await getDb()
      return json(res, 200, summary(db))
    }
    if (pathname === '/api/admin/export.csv' && method === 'GET') {
      requireAdmin(req)
      const db = await getDb()
      res.writeHead(200, {'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store',
        'Content-Disposition':'attachment; filename="jurassic-maths-statistiques.csv"'})
      return res.end(toCsv(summary(db).attempts))
    }
    if (['/api/attempt/start','/api/attempt/answer'].includes(pathname) && method === 'POST') {
      const ip = getIp(req)
      rateLimit(writeBudgets, `writes:${ip}`, 240, 15 * 60_000)
      const body = await readBody(req)
      const {quiz, quizKey} = checkedIdentity(body)
      if (pathname === '/api/attempt/start') {
        const attempt = await persistAttempt(body, ip, quiz, quizKey)
        return json(res, 200, {ok:true, attemptId:attempt.attemptId})
      }
      const questionId = String(body.questionId || '')
      const order = quiz.questions.findIndex(q => String(q.id) === questionId)
      const answer = body.answer
      if (order === -1 || typeof answer !== 'string' || !answer.trim() || answer.length > 120) {
        throw error(400, 'Invalid answer')
      }
      const correct = isAnswerCorrect(answer, quiz.questions[order])
      const attempt = await persistAttempt(body, ip, quiz, quizKey, {
        questionId, order: order + 1, correct,
        submittedAnswer: answer,
        expectedAnswer: quiz.questions[order].answer,
        statement: quiz.questions[order].statement,
      })
      return json(res, 200, {ok:true,
        correct:attempt.answers[questionId]?.correct ?? null,
        complete:Boolean(attempt.completedAt)})
    }
    throw error(404, 'API endpoint not found')
  }
  if (method !== 'GET' && method !== 'HEAD') throw error(405, 'Method not allowed')
  return serveFile(req, res, pathname)
}

const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch(e => {
    const status = e.status || 500
    if (status === 500) console.error(e)
    if (!res.headersSent) json(res, status, {error:status === 500 ? 'Internal server error' : e.message})
    else res.end()
  })
})
// Initialize the schema before accepting visits. No separate migrations needed.
async function startServer() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await initDb(); break }
    catch (e) {
      console.error(`Neon initialization attempt ${attempt}/3 failed:`, e.message)
      if (attempt === 3) { await pool.end(); process.exitCode = 1; return }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Jurassic Maths + Neon dashboard listening on http://localhost:${PORT}`)
    console.log(`Neon PostgreSQL connected; retention: ${RETENTION_DAYS} days`)
  })
}
void startServer()
