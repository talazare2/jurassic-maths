import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './AdminDashboard.css'

type Answer = {
  questionId: string, correct: boolean, answeredAt: string, order: number,
  submittedAnswer?: string | number, expectedAnswer?: string, statement?: string
}
type Attempt = {
  attemptId: string, visitorId: string, ip: string, firstIp: string,
  quizTitle: string, startedAt: string, lastSeenAt: string, completedAt: string | null,
  totalQuestions: number, answeredCount: number, score: number, answers: Answer[],
}
type Results = {attempts: Attempt[], retentionDays: number}

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options})
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
  return data
}
function dateText(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {dateStyle:'medium', timeStyle:'short'})
}

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Results | null>(null)
  const [opened, setOpened] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/admin/results') as Results
      setResults(data)
      setError('')
    } catch (err) {
      if (String(err).includes('Teacher login required')) { setLoggedIn(false); setResults(null) }
      else setError(err instanceof Error ? err.message : 'Impossible de charger les statistiques.')
    }
  }, [])
  useEffect(() => {
    let active = true
    void api('/api/admin/status').then(({loggedIn: yes}) => {
      if (active) setLoggedIn(Boolean(yes))
    }).catch(() => { if (active) {setLoggedIn(false); setError('Serveur indisponible.')} })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!loggedIn) return
    const initial = window.setTimeout(() => void refresh(), 0)
    const interval = window.setInterval(() => void refresh(), 20_000)
    return () => { window.clearTimeout(initial); window.clearInterval(interval) }
  }, [loggedIn, refresh])
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true); setError('')
    try {
      await api('/api/admin/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password})})
      setPassword(''); setLoggedIn(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Connexion impossible.') }
    finally { setWorking(false) }
  }
  async function logout() {
    try { await api('/api/admin/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}) }
    finally { setLoggedIn(false); setResults(null) }
  }

  const attempts = results?.attempts || []
  const completed = attempts.filter(a => a.completedAt)
  const devices = new Set(attempts.map(a => a.visitorId)).size
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="admin-brand">JURASSIC <strong>MATHS</strong></span><h1>Espace professeur</h1></div>
        <div className="admin-header-actions"><a href="/">↗ Retour au quiz</a>{loggedIn && <button onClick={() => void logout()}>Déconnexion</button>}</div>
      </header>
      {loggedIn === null ? <p>Chargement…</p> : !loggedIn ? (
        <section className="admin-card admin-login">
          <h2>Accès réservé au professeur</h2>
          <p>Les élèves n'ont aucun compte ni code à saisir. Le suivi démarre automatiquement.</p>
          <form onSubmit={event => void login(event)}>
            <label htmlFor="admin-password">Mot de passe professeur</label>
            <input id="admin-password" type="password" autoComplete="current-password" required
              value={password} onChange={event => setPassword(event.target.value)} />
            <button disabled={working} type="submit">{working ? 'Connexion…' : 'Se connecter'}</button>
          </form>
          {error && <p className="admin-error" role="alert">{error}</p>}
        </section>
      ) : (
        <>
          <section className="admin-stats" aria-label="Résumé des statistiques">
            <div className="admin-card"><span>Tentatives</span><strong>{attempts.length}</strong></div>
            <div className="admin-card"><span>Devoirs terminés</span><strong>{completed.length}</strong></div>
            <div className="admin-card"><span>Identifiants navigateur</span><strong>{devices}</strong></div>
            <div className="admin-card"><span>Dernier score terminé</span><strong>{completed.length ? `${completed[0].score}/${completed[0].totalQuestions}` : '—'}</strong></div>
          </section>
          <section className="admin-card admin-report">
            <div className="admin-report-head">
              <div><h2>Résultats du devoir</h2><p>Mis à jour toutes les 20 secondes · Conservation {results?.retentionDays ?? 90} jours</p></div>
              <div className="admin-report-actions">
                <button onClick={() => void refresh()}>Actualiser</button>
                <a href="/api/admin/export.csv" className="admin-export">Exporter CSV ↓</a>
              </div>
            </div>
            {error && <p role="alert" className="admin-error">{error}</p>}
            {!attempts.length ? <p>Aucune visite enregistrée pour le moment.</p> : (
              <div className="admin-table-scroll"><table>
                <thead><tr><th>État</th><th>Début</th><th>Dernière activité</th><th>IP vue</th><th>Navigateur</th><th>Progression</th><th>Score</th><th>Détails</th></tr></thead>
                <tbody>{attempts.map(a => (
                  <tr key={a.attemptId}>
                    <td><span className={`admin-pill ${a.completedAt ? 'done' : 'progress'}`}>{a.completedAt ? 'Terminé' : 'En cours'}</span></td>
                    <td>{dateText(a.startedAt)}</td><td>{dateText(a.lastSeenAt)}</td>
                    <td><code>{a.ip}</code></td><td title={a.visitorId}><code>{a.visitorId.slice(0, 8)}…</code></td>
                    <td>{a.answeredCount} / {a.totalQuestions}</td><td><strong>{a.score} / {a.totalQuestions}</strong></td>
                    <td><button aria-expanded={opened === a.attemptId} onClick={() => setOpened(opened === a.attemptId ? null : a.attemptId)}>
                      {opened === a.attemptId ? 'Fermer' : 'Voir'}</button>
                      {opened === a.attemptId && <div className="admin-details"><strong>Réponses par question</strong>
                        {a.answers.length ? a.answers.map(answer => <div className="admin-answer" key={answer.questionId}>
                          <strong>Question {answer.order} — {answer.correct ? '✓ Juste' : '✗ Faux'}</strong>
                          {answer.statement && <p className="admin-answer-statement">{answer.statement}</p>}
                          <p>Réponse de l'élève : <strong>{answer.submittedAnswer ?? 'Non enregistrée (ancienne tentative)'}</strong></p>
                          <p>Réponse attendue : <strong>{answer.expectedAnswer ?? 'Non enregistrée (ancienne tentative)'}</strong></p>
                          <small>{dateText(answer.answeredAt)}</small>
                        </div>) : <p>Aucune réponse encore.</p>}
                        {a.firstIp !== a.ip && <p>Première IP : {a.firstIp}</p>}
                        {a.completedAt && <p>Terminé : {dateText(a.completedAt)}</p>}
                      </div>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <p className="admin-footnote">Une adresse IP ou un identifiant de navigateur aide à retrouver une tentative, mais ne prouve pas à lui seul qui a réalisé le devoir. Les IP peuvent changer ou être partagées.</p>
          </section>
        </>
      )}
    </main>
  )
}
