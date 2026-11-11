import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { listExams, createExam, updateExamStatus } from '../../server/exams.ts'
import type { ExamStatus } from '../../shared/exams.ts'

export default staffDataHandler(
  async (sql, identity, request) => {
    if (request.method === 'GET') {
      const exams = await listExams(sql, identity)
      return { exams }
    }

    if (request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as {
        action?: string
        year?: number
        name?: string
        marksDeadline?: string | null
        examId?: string
        status?: ExamStatus
      } | null

      if (!body || typeof body !== 'object') {
        throw new AuthError(400, 'Format data tidak sah.')
      }

      if (body.action === 'create') {
        const year = typeof body.year === 'number' ? body.year : 2027
        const name = typeof body.name === 'string' ? body.name : ''
        const marksDeadline = typeof body.marksDeadline === 'string' ? body.marksDeadline : null
        const exam = await createExam(sql, identity, { year, name, marksDeadline })
        return { exam, message: 'Peperiksaan berjaya dicipta.' }
      }

      if (body.action === 'status') {
        const examId = typeof body.examId === 'string' ? body.examId : ''
        const status = body.status
        if (!examId || !status) throw new AuthError(400, 'Maklumat status tidak lengkap.')
        await updateExamStatus(sql, identity, { examId, status })
        return { message: 'Status peperiksaan berjaya dikemaskini.' }
      }

      throw new AuthError(400, 'Tindakan tidak sah.')
    }

    throw new AuthError(405, 'Kaedah tidak dibenarkan.')
  },
  ['GET', 'POST'],
)

export const config = { path: '/api/staff/exams' }
