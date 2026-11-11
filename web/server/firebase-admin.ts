import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { AuthError } from './auth-core.ts'
import type { VerifiedIdentity } from './auth-core.ts'

export async function verifyFirebaseToken(token: string): Promise<VerifiedIdentity> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new AuthError(503, 'Konfigurasi pengesahan pelayan tidak sesuai untuk log masuk sebenar.')
  }
  let adminAuth
  try {
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    if (!encoded) throw new Error('missing-admin-config')
    const credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    if (credentials.type !== 'service_account' || !credentials.project_id ||
        !credentials.private_key || !credentials.client_email) {
      throw new Error('invalid-admin-config')
    }
    const app = getApps().find(app => app.name === 'uasa-nexus-auth') ??
      initializeApp({
        credential: cert(credentials),
        projectId: credentials.project_id,
      }, 'uasa-nexus-auth')
    adminAuth = getAuth(app)
  } catch {
    throw new AuthError(503, 'Konfigurasi Firebase pelayan belum lengkap.')
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token, true)
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
      provider: decoded.firebase.sign_in_provider,
      projectId: decoded.aud,
    }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled',
         'auth/argument-error', 'auth/invalid-id-token', 'auth/user-not-found'].includes(code ?? '')) {
      throw new AuthError(401, 'Sesi tidak sah atau telah tamat. Sila log masuk semula.')
    }
    throw new AuthError(503, 'Pengesahan Firebase tidak dapat diselesaikan. Sila cuba lagi.')
  }
}
