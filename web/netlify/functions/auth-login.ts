import { authErrorResponse, AuthError, readBearer, requireStaffIdentity } from '../../server/auth-core.ts'
import { verifyFirebaseToken } from '../../server/firebase-admin.ts'
import { findStaffAccount } from '../../server/accounts.ts'
import { isStaffRole } from '../../shared/auth.ts'

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, message: 'Kaedah tidak dibenarkan.' }, {
      status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    })
  }

  try {
    const bearer = readBearer(request.headers.get('authorization'))
    const identity = requireStaffIdentity(await verifyFirebaseToken(bearer))
    const account = await findStaffAccount(identity)
    if (!account || !account.roles.length || !account.roles.every(isStaffRole)) {
      throw new AuthError(403, 'Akaun tidak aktif, belum didaftarkan, atau belum diberikan peranan guru. Hubungi setiausaha peperiksaan.')
    }
    return Response.json({ ok: true, account }, {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export const config = { path: '/api/auth/login' }
