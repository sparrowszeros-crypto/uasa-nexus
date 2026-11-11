import { AuthError } from '../../server/auth-core.ts'
import { staffDataHandler, staffScope } from '../../server/staff-data.ts'

export default staffDataHandler(async (sql, identity) => {
  const [scope] = await staffScope(sql, identity)
  if (!scope) throw new AuthError(403, 'Akses staf tidak tersedia untuk akaun ini.')
  return { scope }
})

export const config = { path: '/api/staff/scope' }
