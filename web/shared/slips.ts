import type { StudentResultEntry } from './exams.ts'

export interface SlipClass {
  examId: string
  examName: string
  classId: string
  className: string
  year: number
}

export interface SlipPupil {
  id: string
  name: string
  number: string
}

export interface SlipSubject {
  id: string
  name: string
  code: string
  mark: number | null
  attendance: StudentResultEntry['attendance']
  grade: string
}

export interface ExamSlip {
  pupil: SlipPupil
  subjects: SlipSubject[]
}
