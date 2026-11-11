import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { changeRoster, parseRosterCommand, readRoster, rosterId } from '../../server/roster.ts'

const denied = () => new AuthError(404, 'Kelas tidak tersedia untuk akaun ini.')

export default staffDataHandler(async (sql, identity, request) => {
  if (request.method === 'GET') {
    const values = new URL(request.url).searchParams.getAll('classId')
    if (values.length > 1) throw new AuthError(400, 'Pilihan kelas tidak sah.')
    const classId = values.length ? rosterId(values[0]) : null
    const [data] = await readRoster(sql, identity, classId)
    if (!data.staff) throw new AuthError(403, 'Akses senarai murid memerlukan peranan setiausaha atau guru kelas.')
    if (classId && data.pupils === null) throw denied()
    return classId ? { pupils: data.pupils } : { classes: data.classes }
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AuthError(415, 'Format permintaan tidak disokong.')
  }
  const body = await request.text()
  if (body.length > 4096) throw new AuthError(413, 'Permintaan terlalu besar.')
  let input: unknown
  try { input = JSON.parse(body) } catch { throw new AuthError(400, 'Maklumat borang tidak sah.') }
  const command = parseRosterCommand(input)
  const [result] = await changeRoster(sql, identity, command)
  if (!result.allowed) throw denied()
  if (!result.valid_date) throw new AuthError(400, command.action === 'register'
    ? 'Tarikh mula mesti dalam tahun sesi kelas.'
    : 'Tarikh keluar mesti pada atau selepas tarikh mula dan tidak melebihi hari ini.')
  if (!result.changed) throw new AuthError(409, command.action === 'register'
    ? 'Nombor daftar ini sudah digunakan. Semak rekod murid sebelum mendaftar.'
    : 'Rekod aktif murid dalam kelas ini tidak tersedia untuk dikemas kini.')
  return {}
}, ['GET', 'POST'])

export const config = { path: '/api/staff/class-roster' }
