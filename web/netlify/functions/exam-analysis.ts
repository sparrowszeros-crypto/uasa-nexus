import { AuthError } from '../../server/auth-core.ts'
import { readAnalysisExams, readExamAnalysis, summarizeAnalysis } from '../../server/exam-analysis.ts'
import { rosterId } from '../../server/roster.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import type { AnalysisExam, PendingPupil } from '../../shared/analysis.ts'

const forbidden = () => new AuthError(403, 'Analisis hanya tersedia untuk setiausaha peperiksaan.')

export default staffDataHandler(async (sql, identity, request) => {
  const params = new URL(request.url).searchParams
  const examId = params.has('examId') ? rosterId(params.get('examId')) : null
  const classId = params.has('classId') ? rosterId(params.get('classId')) : null
  const subjectId = params.has('subjectId') ? rosterId(params.get('subjectId')) : null

  if (Boolean(classId) !== Boolean(subjectId) || (!examId && classId)) {
    throw new AuthError(400, 'Pilihan peperiksaan, kelas atau subjek tidak lengkap.')
  }
  if (!examId) {
    const [row] = await readAnalysisExams(sql, identity)
    if (!row) throw forbidden()
    return { exams: row.exams as AnalysisExam[] }
  }

  const detail = classId && subjectId ? { classId, subjectId } : undefined
  const [row] = await readExamAnalysis(sql, identity, examId, detail)
  if (!row.allowed) throw forbidden()
  if (!row.examExists) throw new AuthError(404, 'Peperiksaan tidak ditemui.')
  if (detail) {
    if (!row.groupExists) throw new AuthError(404, 'Kelas dan subjek tidak tersedia untuk peperiksaan ini.')
    return { pupils: row.pupils as PendingPupil[] }
  }
  return { rows: (row.rows as Parameters<typeof summarizeAnalysis>[0][]).map(summarizeAnalysis) }
})

export const config = { path: '/api/admin/exam-analysis' }
