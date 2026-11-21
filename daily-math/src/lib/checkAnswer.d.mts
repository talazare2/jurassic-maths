export type AnswerQuestion = { answer: string; acceptedAnswers?: string[] }
export declare function normalizeAnswer(value: string): string
export declare function asNumber(value: string): number | null
export declare function isAnswerCorrect(answer: string, question: AnswerQuestion): boolean
