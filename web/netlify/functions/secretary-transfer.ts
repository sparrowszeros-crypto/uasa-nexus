import { AuthError } from '../../server/auth-core.ts'
import { rosterId } from '../../server/roster.ts'
import { listSuccessors, lockStaffRoleChanges, transferSecretary } from '../../server/secretary-transfer.ts'
import { staffDataHandler } from '../../server/staff-data.ts'

const forbidden = () => new AuthError(403, 'Hanya setiausaha peperiksaan boleh memindahkan jawatan.')

export default staffDataHandler(async (sql, identity, request) => {
  if (request.method === 'GET') {
    const [row] = await listSuccessors(sql, identity)
    if (!row) throw forbidden()
    return { teachers: row.teachers }
  }

  const body = await request.text()
  if (body.length > 2048) throw new AuthError(413, 'Permintaan terlalu besar.')
  let input: { teacherId?: unknown; teacherEmail?: unknown } | null
  try { input = JSON.parse(body) } catch { throw new AuthError(400, 'Maklumat pemindahan tidak sah.') }

  const teacherId = rosterId(input?.teacherId)
  const teacherEmail = input?.teacherEmail
  if (typeof teacherEmail !== 'string' || !teacherEmail || teacherEmail.length > 254) {
    throw new AuthError(400, 'Maklumat guru penerima tidak sah.')
  }

  const [, [result]] = await sql.transaction([
    lockStaffRoleChanges(sql),
    transferSecretary(sql, identity, teacherId, teacherEmail),
  ], { isolationLevel: 'ReadCommitted' })
  if (!result.allowed) throw forbidden()
  if (!result.transferred) {
    throw new AuthError(409, 'Guru ini tidak lagi layak menerima jawatan. Muat semula senarai dan semak akaunnya.')
  }
  return {}
}, ['GET', 'POST'])

export const config = { path: '/api/admin/secretary-transfer' }
