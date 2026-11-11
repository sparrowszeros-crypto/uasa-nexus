import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler, staffResults } from '../../server/staff-data.ts'

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

export default staffDataHandler(async (sql, identity, request) => {
  const params = new URL(request.url).searchParams
  function id(name: string) {
    const [value, ...duplicates] = params.getAll(name)
    if (!value || duplicates.length || !uuid.test(value)) {
      throw new AuthError(400, 'Pilihan peperiksaan, kelas atau subjek tidak sah.')
    }
    return value
  }

  const [row] = await staffResults(sql, identity, {
    examId: id('examId'), classId: id('classId'), subjectId: id('subjectId'),
  })
  if (!row.staff) throw new AuthError(403, 'Akses staf tidak tersedia untuk akaun ini.')
  if (row.results === null) throw new AuthError(404, 'Keputusan tidak tersedia untuk pilihan ini.')
  return { results: row.results }
})

export const config = { path: '/api/staff/results' }
