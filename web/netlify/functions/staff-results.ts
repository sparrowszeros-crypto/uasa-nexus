import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { getExamSubjectResults, saveMarks } from '../../server/exams.ts'
import type { SaveMarksPayload } from '../../shared/exams.ts'

const uuidRegex = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

export function parseMarksPayload(value: unknown): SaveMarksPayload {
  const invalid = (message: string): never => { throw new AuthError(400, message) }
  const isId = (v: unknown): v is string => typeof v === 'string' && uuidRegex.test(v)
  if (!value || typeof value !== 'object') return invalid('Format data markah tidak sah.')
  const input = value as Record<string, unknown>
  const { examId, classId, subjectId, entries } = input
  if (!isId(examId) || !isId(classId) || !isId(subjectId)) return invalid('Pilihan peperiksaan, kelas atau subjek tidak sah.')
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 800) return invalid('Senarai perubahan markah tidak sah.')
  const seen = new Set<string>()
  const normalized: SaveMarksPayload['entries'] = entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return invalid('Rekod markah tidak sah.')
    const { studentId, mark, attendance } = entry as Record<string, unknown>
    if (!isId(studentId) || seen.has(studentId.toLowerCase())) return invalid('ID murid tidak sah atau berulang.')
    seen.add(studentId.toLowerCase())
    if (attendance === 'present' && typeof mark === 'number' && Number.isFinite(mark) && mark >= 0 && mark <= 100) {
      return { studentId, mark: Math.round(mark * 100) / 100, attendance }
    }
    if ((attendance === 'absent' || attendance === 'pending') && mark === null) return { studentId, mark, attendance }
    return invalid('Markah mesti antara 0 hingga 100 untuk murid hadir. Untuk TH atau belum diisi, kosongkan markah.')
  })
  return { examId, classId, subjectId, entries: normalized }
}

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
      const payload = parseMarksPayload(await request.json().catch(() => null))
      const result = await saveMarks(sql, identity, payload)
      return { ok: true, message: 'Markah berjaya disimpan.', ...result }
    }

    throw new AuthError(405, 'Kaedah tidak dibenarkan.')
  },
  ['GET', 'POST'],
)

export const config = { path: '/api/staff/results' }
