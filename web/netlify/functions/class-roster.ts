import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler } from '../../server/staff-data.ts'
import { parseRosterCsv, rosterCsvMaxBytes } from '../../shared/roster-csv.ts'
import { changeRoster, importRoster, parseRosterCommand, readRoster, rosterDate, rosterId } from '../../server/roster.ts'

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
  if (body.length > 2 * rosterCsvMaxBytes) throw new AuthError(413, 'Permintaan terlalu besar.')
  let input: unknown
  try { input = JSON.parse(body) } catch { throw new AuthError(400, 'Maklumat borang tidak sah.') }
  try {
    if (input && typeof input === 'object' && 'action' in input && input.action === 'import') {
      const fields = input as Record<string, unknown>
      const classId = rosterId(fields.classId)
      const date = rosterDate(fields.date)
      if (typeof fields.csv !== 'string') throw new AuthError(400, 'Kandungan CSV diperlukan.')
      if (Buffer.byteLength(fields.csv, 'utf8') > rosterCsvMaxBytes) throw new AuthError(413, 'Fail CSV melebihi 256 KB.')
      let students: ReturnType<typeof parseRosterCsv>
      try { students = parseRosterCsv(fields.csv) }
      catch (error) { throw new AuthError(400, error instanceof Error ? error.message : 'Fail CSV tidak sah.') }
      const [result] = await importRoster(sql, identity, classId, date, students)
      if (!result.allowed) throw denied()
      if (!result.valid_date) throw new AuthError(400, 'Tarikh mula mesti dalam tahun sesi kelas.')
      if (result.duplicates.length) {
        const examples = (result.duplicates as { line: number; number: string }[]).slice(0, 5)
          .map(row => 'baris ' + row.line + ' (' + row.number + ')').join(', ')
        throw new AuthError(409, 'Nombor daftar sudah digunakan: ' + examples
          + (result.duplicates.length > 5 ? ' dan lain-lain' : '') + '. Tiada rekod disimpan.')
      }
      return { imported: result.imported }
    }
    if (body.length > 4096) throw new AuthError(413, 'Permintaan terlalu besar.')
    const command = parseRosterCommand(input)
    const [result] = await changeRoster(sql, identity, command)
    if (!result.allowed) throw denied()
    if (!result.valid_date) throw new AuthError(400, command.action === 'register'
      ? 'Tarikh mula mesti dalam tahun sesi kelas.'
      : 'Tarikh keluar mesti pada atau selepas tarikh mula dan tidak melebihi hari ini.')
    if (!result.changed) {
      const message = {
        register: 'Nombor daftar ini sudah digunakan.',
        edit: 'Nombor daftar sudah digunakan atau murid tidak aktif dalam kelas ini.',
        delete: 'Murid tidak aktif dalam kelas ini atau mempunyai rekod berkaitan. Gunakan Kemas kini status jika murid keluar.',
        rename: 'Rekod aktif murid dalam kelas ini tidak tersedia untuk dikemas kini.',
        exit: 'Rekod aktif murid dalam kelas ini tidak tersedia untuk dikemas kini.',
      }[command.action]
      throw new AuthError(409, message)
    }
    return {}
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === '23505') throw new AuthError(409, 'Nombor daftar sudah digunakan. Tiada perubahan disimpan.')
      if (error.code === '23503') throw new AuthError(409, 'Rekod berkaitan telah berubah. Muat semula senarai murid.')
    }
    throw error
  }
}, ['GET', 'POST'])

export const config = { path: '/api/staff/class-roster' }
