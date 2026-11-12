import crypto from 'node:crypto'
import { AuthError } from './auth-core.ts'
import type { VerifiedIdentity } from './auth-core.ts'

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

let cachedCerts: Record<string, string> | null = null
let certsExpiryMs = 0

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now()
  if (cachedCerts && now < certsExpiryMs) {
    return cachedCerts
  }
  try {
    const res = await fetch(GOOGLE_CERTS_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const cacheControl = res.headers.get('cache-control') || ''
    const match = cacheControl.match(/max-age=(\d+)/)
    const maxAgeSec = match ? parseInt(match[1], 10) : 3600
    certsExpiryMs = now + maxAgeSec * 1000
    cachedCerts = (await res.json()) as Record<string, string>
    return cachedCerts
  } catch {
    if (cachedCerts) return cachedCerts
    throw new AuthError(503, 'Sijil pengesahan Google tidak dapat dimuatkan. Sila cuba lagi.')
  }
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}

function getExpectedProjectId(): string {
  if (process.env.VITE_FIREBASE_PROJECT_ID) return process.env.VITE_FIREBASE_PROJECT_ID
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    if (raw) {
      const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { project_id?: string }
      if (parsed.project_id) return parsed.project_id
    }
  } catch {
    // Abaikan ralat parse
  }
  return 'uasa-nexus'
}

export async function verifyFirebaseToken(token: string): Promise<VerifiedIdentity> {
  if (!token || typeof token !== 'string') {
    throw new AuthError(401, 'Sila log masuk semula.')
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new AuthError(401, 'Sesi tidak sah. Sila log masuk semula.')
  }

  const [rawHeader, rawPayload, rawSignature] = parts

  let header: { alg?: string; kid?: string }
  let payload: {
    exp?: number
    iat?: number
    auth_time?: number
    iss?: string
    aud?: string
    sub?: string
    email?: string
    email_verified?: boolean
    firebase?: { sign_in_provider?: string }
  }

  try {
    header = JSON.parse(base64UrlDecode(rawHeader)) as { alg?: string; kid?: string }
    payload = JSON.parse(base64UrlDecode(rawPayload)) as typeof payload
  } catch {
    throw new AuthError(401, 'Format token tidak sah.')
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new AuthError(401, 'Algoritma token tidak sah.')
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now) {
    throw new AuthError(401, 'Sesi Firebase telah tamat tempoh. Sila log masuk semula.')
  }

  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > now
    || typeof payload.auth_time !== 'number' || !Number.isFinite(payload.auth_time) || payload.auth_time > now) {
    throw new AuthError(401, 'Masa token Firebase tidak sah.')
  }

  const expectedProjectId = getExpectedProjectId()
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`

  if (payload.iss !== expectedIssuer) {
    throw new AuthError(401, 'Pengeluar token Firebase tidak sepadan.')
  }

  if (payload.aud !== expectedProjectId) {
    throw new AuthError(401, 'Projek token Firebase tidak sah.')
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new AuthError(401, 'Identiti pengguna Firebase tidak sah.')
  }

  // Sahkan tandatangan menggunakan sijil awam Google rasmi
  const certs = await fetchGooglePublicCerts()
  const cert = certs[header.kid]
  if (!cert) {
    throw new AuthError(401, 'Sijil pengesahan tidak ditemui.')
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(`${rawHeader}.${rawPayload}`)
    const isValid = verifier.verify(cert, Buffer.from(rawSignature, 'base64url'))
    if (!isValid) {
      throw new AuthError(401, 'Tandatangan token Firebase tidak sah.')
    }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError(401, 'Pengesahan tandatangan gagal.')
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    provider: payload.firebase?.sign_in_provider,
    projectId: payload.aud,
  }
}
