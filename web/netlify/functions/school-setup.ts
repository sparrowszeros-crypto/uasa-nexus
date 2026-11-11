import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { changeSchoolSetup, parseSetupCommand, schoolSetup } from '../../server/school-setup.ts'

const denied = () => new AuthError(403, 'Hanya setiausaha peperiksaan boleh mengurus penetapan sekolah.')

export default staffDataHandler(async (sql, identity, request) => {
  if (request.method === 'GET') {
    const [setup] = await schoolSetup(sql, identity)
    if (!setup) throw denied()
    return { setup }
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AuthError(415, 'Format permintaan tidak disokong.')
  }
  const body = await request.text()
  if (body.length > 4096) throw new AuthError(413, 'Permintaan terlalu besar.')
  let input: unknown
  try { input = JSON.parse(body) } catch { throw new AuthError(400, 'Maklumat borang tidak sah.') }
  const command = parseSetupCommand(input)
  const [result] = await changeSchoolSetup(sql, identity, command)
  if (!result.allowed) throw denied()
  if (!result.changed) {
    const message = command.action === 'teacher' ? 'E-mel ini sudah didaftarkan.'
      : command.action === 'class' ? 'Nama kelas ini sudah digunakan bagi sesi tersebut.'
      : command.action === 'subject' ? 'Kod subjek ini sudah didaftarkan.'
      : command.action === 'revoke' ? 'Tugasan ini sudah tiada.'
      : !result.eligible ? 'Guru, peranan, kelas atau subjek tidak lagi tersedia.'
      : 'Tugasan ini sudah wujud.'
    throw new AuthError(409, message)
  }
  return {}
}, ['GET', 'POST'])

export const config = { path: '/api/admin/school-setup' }
