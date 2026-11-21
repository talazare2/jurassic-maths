export type Question = {
  id: string
  category: string
  difficulty: number
  statement: string
  answer: string // Format français autorisé : "3,5" ; "10,00"
  explanation: string
  acceptedAnswers?: string[] // Variantes orthographiques, littérales ou QCM.
  // Optional illustration kept in public/figures/, e.g. "/figures/triangle-abc.svg".
  figure?: { src: string; alt: string; caption?: string }
}

export type DailyQuiz = {
  id: number
  date: string
  title: string
  questions: Question[]
}

export type QuizDatabase = {
  quizzes: DailyQuiz[]
}
