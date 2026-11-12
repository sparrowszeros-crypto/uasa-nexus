import type { ExamStatus } from './exams.ts'

export const analysisGrades = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type AnalysisGrade = typeof analysisGrades[number]

export interface AnalysisExam {
  id: string
  name: string
  year: number
  status: ExamStatus
}

export interface AnalysisRow {
  classId: string
  className: string
  level: string
  subjectId: string
  subjectName: string
  subjectCode: string
  expected: number
  present: number
  absent: number
  pending: number
  markTotal: number
  grades: Record<AnalysisGrade, number>
}

export interface PendingPupil {
  id: string
  name: string
  number: string
}
