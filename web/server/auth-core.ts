import { isStaffRole } from '../shared/auth.ts'
import type { AccountProfile } from '../shared/auth.ts'

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface VerifiedIdentity {
  uid: string
  email?: string
  emailVerified: boolean
  provider?: string
  projectId: string
}

export interface AuthDependencies {
  verify: (token: string) => Promise<VerifiedIdentity>
  findOrBind: (identity: VerifiedIdentity) => Promise<AccountProfile | null>
}

export function readBearer(header: string | null): string {
  const match = header?.match(/^Bearer ([^\s]+)$/i)
  if (!match || match[1].length > 16000) {
    throw new AuthError(401, 'Sila log masuk ke dalam sistem.')
  }
  return match[1]
}

export function requireStaffIdentity(identity: VerifiedIdentity): VerifiedIdentity & { email: string } {
  if (!identity.uid || !identity.projectId || !identity.email) {
    throw new AuthError(401, 'Sila log masuk semula.')
  }
  return { ...identity, email: identity.email.toLowerCase().trim() }
}

export async function authenticateStaff(header: string | null, dependencies: AuthDependencies) {
  const token = readBearer(header)
  const identity = await dependencies.verify(token)
  const account = await dependencies.findOrBind(requireStaffIdentity(identity))
  if (!account || !account.roles.length || !account.roles.every(isStaffRole)) {
    throw new AuthError(403, 'Akaun tidak aktif, belum didaftarkan, atau belum diberikan peranan guru. Hubungi setiausaha peperiksaan.')
  }
  return account
}

export function authErrorResponse(error: unknown): Response {
  const status = error instanceof AuthError ? error.status : 503
  const message = error instanceof AuthError
    ? error.message
    : 'Perkhidmatan log masuk belum tersedia. Sila cuba lagi.'
  return Response.json({ ok: false, message }, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
