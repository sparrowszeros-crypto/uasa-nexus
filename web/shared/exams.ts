export const examStatuses = ['draft', 'submitted', 'verified', 'published'] as const
export type ExamStatus = typeof examStatuses[number]

export const minimumPassingMark = 20

export interface Exam {
  id: string
  name: string
  year: number
  status: ExamStatus
  marksDeadline: string | null
  publishedAt: string | null
  createdAt: string
}

export interface StudentResultEntry {
  studentId: string
  studentName: string
  studentNumber: string
  mark: number | null
  attendance: 'present' | 'absent' | 'pending'
  grade: string
}

export interface ExamSubjectResultData {
  examId: string
  examName: string
  examStatus: ExamStatus
  classId: string
  className: string
  subjectId: string
  subjectName: string
  subjectCode: string
  results: StudentResultEntry[]
}

export interface SaveMarksPayload {
  examId: string
  classId: string
  subjectId: string
  entries: {
    studentId: string
    mark: number | null
    attendance: 'present' | 'absent' | 'pending'
  }[]
}

/**
 * Pengiraan gred automatik mengikut skala sekolah:
 * TH: Tidak Hadir
 * 82 - 100: A
 * 66 - 81:  B
 * 50 - 65:  C
 * 35 - 49:  D
 * 20 - 34:  E
 * 0 - 19:   F
 */
export function calculateGrade(mark: number | null, attendance: 'present' | 'absent' | 'pending'): string {
  if (attendance === 'absent') return 'TH'
  if (attendance === 'pending' || mark === null || mark === undefined) return '—'
  if (mark >= 82) return 'A'
  if (mark >= 66) return 'B'
  if (mark >= 50) return 'C'
  if (mark >= 35) return 'D'
  if (mark >= minimumPassingMark) return 'E'
  return 'F'
}
