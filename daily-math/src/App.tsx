import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import MathText from './components/MathText'
import AdminDashboard from './AdminDashboard'
import { newAttemptId, recordAnswer, setUpTrackingRetries, startAttempt } from './lib/quizTracking'
import quizData from './data/quizzes.json'
import { isAnswerCorrect } from './lib/checkAnswer.mjs'
import type { QuizDatabase } from './types/quiz'

import './App.css'

// On garde le même quiz JSON. La sélection automatique par date viendra ensuite.
const database: QuizDatabase = quizData
const quiz = database.quizzes[0]
const quizId: unknown = quiz && 'id' in quiz ? quiz.id : undefined
const QUIZ_KEY = typeof quizId === 'string' && quizId.trim()
  ? quizId : quiz?.title || 'jurassic-maths'

// Si le navigateur ne peut pas lire la vidéo, on affiche le GIF original entier.
const DINO_GIF_DURATION_MS = 16 * 700

function QuizApp() {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [inputAnswer, setInputAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [score, setScore] = useState(0)
  const [showDinosaur, setShowDinosaur] = useState(false)
  const [dinoEpisode, setDinoEpisode] = useState(0)
  const [useGifFallback, setUseGifFallback] = useState(false)
  // Generated automatically; the student never enters a name, code, or password.
  const [attemptId, setAttemptId] = useState(() => newAttemptId())
  const [trackingWarning, setTrackingWarning] = useState(false)

  useEffect(() => setUpTrackingRetries(), [])
  useEffect(() => {
    let active = true
    void startAttempt(QUIZ_KEY, attemptId).then(sent => { if (active) setTrackingWarning(!sent) })
    return () => { active = false }
  }, [attemptId])

  useEffect(() => {
    if (!showDinosaur || !useGifFallback) return
    const timer = window.setTimeout(() => setShowDinosaur(false), DINO_GIF_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [showDinosaur, useGifFallback, dinoEpisode])

  if (!quiz || quiz.questions.length === 0) {
    return <main className="empty-screen">Aucune question disponible. Vérifie ton fichier JSON.</main>
  }

  const totalQuestions = quiz.questions.length
  const finished = questionIndex >= totalQuestions
  const question = finished ? undefined : quiz.questions[questionIndex]
  const currentNumber = Math.min(questionIndex + 1, totalQuestions)
  const progress = (questionIndex / totalQuestions) * 100

  function resetQuiz() {
    setQuestionIndex(0)
    setInputAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    setValidationError('')
    setScore(0)
    setShowDinosaur(false)
    setTrackingWarning(false)
    setAttemptId(newAttemptId())
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted || !question) return

    const actual = inputAnswer.trim()
    if (!actual || actual.length > 120) {
      setValidationError('Entre une réponse de 1 à 120 caractères.')
      return
    }

    const correct = isAnswerCorrect(actual, question)
    setSubmitted(true)
    setIsCorrect(correct)
    setValidationError('')

    // The server grades and records each answer, using the request IP for the teacher.
    void recordAnswer(QUIZ_KEY, attemptId, String(question.id), actual)
      .then(sent => setTrackingWarning(!sent))

    if (correct) {
      setScore(previous => previous + 1)
    } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setUseGifFallback(false)
      setDinoEpisode(previous => previous + 1)
      setShowDinosaur(true)
    }
  }

  function nextQuestion() {
    setQuestionIndex(previous => previous + 1)
    setInputAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    setValidationError('')
    setShowDinosaur(false)
  }

  return (
    <div className="site-shell">
      {/* Une toute petite identité de marque : le quiz reste au premier plan. */}
      <header className="site-header">
        <span className="wordmark">JURASSIC <span>MATHS</span><span aria-hidden="true"> ·</span></span>
        <span className="daily-label">{quiz.title}</span>
      </header>

      <main className="focus-card" aria-label="Défi de mathématiques">
        <div className="card-head">
          <span className="head-topic">{finished ? 'Défi terminé' : question?.category}</span>
          <span className="question-number">{finished ? `${totalQuestions} / ${totalQuestions}` : `Question ${currentNumber} / ${totalQuestions}`}</span>
        </div>

        <div className="progress-track" role="progressbar"
          aria-label="Progression du défi"
          aria-valuemin={0} aria-valuemax={totalQuestions}
          aria-valuenow={finished ? totalQuestions : questionIndex}>
          <div className="progress-fill" style={{ width: `${finished ? 100 : progress}%` }} />
        </div>

        {trackingWarning && <p className="tracking-warning" role="status">
          La connexion au suivi est momentanément indisponible. Les résultats seront renvoyés automatiquement.
        </p>}

        {finished ? (
          <section className="workspace results-panel" aria-live="polite">
            <p className="section-kicker">Défi terminé</p>
            <h1>{score === totalQuestions ? 'Survie parfaite !' : 'Tu as survécu au Crétacé !'}</h1>
            <div className="big-score" aria-label={`Score : ${score} sur ${totalQuestions}`}>{score}<span> / {totalQuestions}</span></div>
            <p>Bravo, tu as terminé les exercices.</p>
            <button type="button" className="primary-button" onClick={resetQuiz}>Recommencer <span aria-hidden="true">→</span></button>
          </section>
        ) : question && (
          <section className="workspace" key={question.id}>
            <div className="question-area">
              <p className="section-kicker">À toi de jouer</p>
              <div className="math-display"><MathText>{question.statement}</MathText></div>
            </div>

            {!submitted ? (
              <form className="answer-form" onSubmit={handleSubmit}>
                <label htmlFor="student-answer">Ta réponse</label>
                <input
                  id="student-answer"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder=""
                  value={inputAnswer}
                  onChange={event => {
                    setInputAnswer(event.target.value)
                    setValidationError('')
                  }}
                  aria-invalid={Boolean(validationError)}
                  aria-describedby={validationError ? 'answer-error' : 'answer-help'}
                />
                <p className="input-help" id="answer-help">Nombre, mot, expression ou lettre du QCM · Entrée pour vérifier</p>
                {validationError && <p className="error-message" id="answer-error" role="alert">{validationError}</p>}
                <button className="primary-button" type="submit">Vérifier <span aria-hidden="true">→</span></button>
              </form>
            ) : !showDinosaur && (
              <div className={`feedback-panel ${isCorrect ? 'feedback-win' : 'feedback-lose'}`} role="status">
                <h2>{isCorrect ? 'Bien joué !' : 'Croc ! Pas cette fois.'}</h2>
                <p className="expected-answer">Réponse attendue : <strong>{question.answer}</strong></p>
                <div className="explanation"><MathText>{question.explanation}</MathText></div>
                {isCorrect && (
                  <img
                    className="success-inline-gif"
                    src="/triceratops-aura-100.gif"
                    alt="Tricératops immobile : ses lunettes pixelisées descendent, puis AURA +100 apparaît"
                  />
                )}
                <button className="primary-button" type="button" onClick={nextQuestion}>
                  {currentNumber === totalQuestions ? 'Voir mon score' : 'Question suivante'} <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Mauvaise réponse : on conserve l'animation T. rex existante. */}
        {showDinosaur && (
          <div className="dino-overlay" role="status" aria-label="Le T. rex apparaît et mord après une mauvaise réponse.">
            <p className="dino-caption">Oh non… le T. rex !</p>
            <div className="dino-stage">
              {useGifFallback ? (
                <img
                  className="dino-media"
                  key={`${dinoEpisode}-gif`}
                  src={`/trex-attaque.gif?episode=${dinoEpisode}`}
                  alt="Un tyrannosaure dessiné entre par la droite, mord et repart"
                />
              ) : (
                <video
                  className="dino-media"
                  key={dinoEpisode}
                  src="/trex-attaque-fullscreen.mp4"
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  aria-label="Un tyrannosaure dessiné entre par la droite, mord et repart"
                  onEnded={() => setShowDinosaur(false)}
                  onError={() => setUseGifFallback(true)}
                />
              )}
            </div>
            <button className="skip-animation" type="button" onClick={() => setShowDinosaur(false)}>
              Passer l’animation
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  if (window.location.pathname.replace(/\/$/, '') === '/admin') return <AdminDashboard />
  return <QuizApp />
}

export default App
