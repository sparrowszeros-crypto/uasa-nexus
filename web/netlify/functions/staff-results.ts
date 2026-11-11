import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { getExamSubjectResults, saveMarks } from '../../server/exams.ts'
import type { SaveMarksPayload } from '../../shared/exams.ts'

const uuidRegex = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

export default staffDataHandler(
  async (sql, identity, request) => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      function requireId(name: string): string {
        const val = params.get(name)
        if (!val || !uuidRegex.test(val)) {
          throw new AuthError(400, `Parameter ${name} tidak sah.`)
        }
        return val
      }

      const examId = requireId('examId')
      const classId = requireId('classId')
      const subjectId = requireId('subjectId')

      const data = await getExamSubjectResults(sql, identity, { examId, classId, subjectId })
      return { data }
    }

    if (request.method === 'POST') {
      const payload = (await request.json().catch(() => null)) as SaveMarksPayload | null
      if (!payload || typeof payload !== 'object') {
        throw new AuthError(400, 'Format data markah tidak sah.')
      }

      if (!uuidRegex.test(payload.examId) || !uuidRegex.test(payload.classId) || !uuidRegex.test(payload.subjectId)) {
        throw new AuthError(400, 'ID peperiksaan, kelas atau subjek tidak sah.')
      }

      if (!Array.isArray(payload.entries)) {
        throw new AuthError(400, 'Senarai markah murid diperlukan.')
      }

      const result = await saveMarks(sql, identity, payload)
      return { ok: true, message: 'Markah berjaya disimpan.', ...result }
    }

    throw new AuthError(405, 'Kaedah tidak dibenarkan.')
  },
  ['GET', 'POST'],
)

export const config = { path: '/api/staff/results' }
