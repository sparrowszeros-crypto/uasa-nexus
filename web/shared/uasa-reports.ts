import { analysisGrades, type AnalysisRow } from './analysis.ts'

export interface CandidateSummary {
  classId: string
  registered: number
  attended: number
  passed: number
  failed: number
  absentAll: number
  pending: number
}

export function summarizeUasa(rows: AnalysisRow[]) {
  const grades = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }
  let absent = 0
  let pending = 0
  for (const row of rows) {
    for (const grade of analysisGrades) grades[grade] += row.grades[grade]
    absent += row.absent
    pending += row.pending
  }
  const present = analysisGrades.reduce((sum, grade) => sum + grades[grade], 0)
  const points = analysisGrades.reduce((sum, grade, index) => sum + grades[grade] * (index + 1), 0)
  return {
    grades, absent, pending, present, recorded: present + absent,
    passed: present - grades.F, failed: grades.F, gradePoint: present ? points / present : null,
  }
}

export function combineCandidates(rows: CandidateSummary[]) {
  return rows.reduce((total, row) => ({
    registered: total.registered + row.registered,
    attended: total.attended + row.attended,
    passed: total.passed + row.passed,
    failed: total.failed + row.failed,
    absentAll: total.absentAll + row.absentAll,
    pending: total.pending + row.pending,
  }), { registered: 0, attended: 0, passed: 0, failed: 0, absentAll: 0, pending: 0 })
}
