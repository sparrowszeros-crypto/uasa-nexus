import { AuthError } from '../../server/auth-core.ts'
import { changeRecord, parseRecordChange } from '../../server/manage-records.ts'
import { lockStaffRoleChanges } from '../../server/secretary-transfer.ts'
import { staffDataHandler } from '../../server/staff-data.ts'

export default staffDataHandler(async (sql, identity, request) => {
  const body = await request.text()
  if (body.length > 4096) throw new AuthError(413, 'Permintaan terlalu besar.')
  let input: unknown
  try { input = JSON.parse(body) } catch { throw new AuthError(400, 'Maklumat rekod tidak sah.') }
  const command = parseRecordChange(input)
  try {
    const change = changeRecord(sql, identity, command)
    const rows = command.entity === 'teacher'
      ? (await sql.transaction([lockStaffRoleChanges(sql), change], { isolationLevel: 'ReadCommitted' }))[1]
      : await change
    const [result] = rows
    if (!result.allowed) throw new AuthError(403, 'Hanya setiausaha peperiksaan boleh mengurus rekod ini.')
    if (!result.found) throw new AuthError(404, 'Rekod tidak tersedia untuk tindakan ini.')
    if (!result.changed) {
      throw new AuthError(409, command.action === 'delete'
        ? 'Rekod masih digunakan atau mempunyai sejarah. Semak tugasan, pendaftaran dan keputusan yang berkaitan.'
        : 'Nama atau kod sudah digunakan, atau peranan guru masih mempunyai tugasan.')
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === '23505') throw new AuthError(409, 'Butiran ini sudah digunakan oleh rekod lain.')
      if (error.code === '23503') throw new AuthError(409, 'Rekod masih mempunyai pautan dan tidak boleh dipadam.')
    }
    throw error
  }
  return {}
}, ['POST'])

export const config = { path: '/api/admin/manage-records' }
