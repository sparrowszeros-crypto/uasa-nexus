import { authenticateStaff, authErrorResponse } from '../../server/auth-core.ts'
import { verifyFirebaseToken } from '../../server/firebase-admin.ts'
import { findOrBindStaff } from '../../server/accounts.ts'

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, message: 'Kaedah tidak dibenarkan.' }, {
      status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    })
  }
  try {
    const account = await authenticateStaff(request.headers.get('authorization'), {
      verify: verifyFirebaseToken,
      findOrBind: findOrBindStaff,
    })
    return Response.json({ ok: true, account }, {
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
export const config = { path: '/api/auth/login' }
