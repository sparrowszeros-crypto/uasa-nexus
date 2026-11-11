import crypto from 'node:crypto'
import type { VerifiedIdentity } from './auth-core.ts'

const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60 // 24 jam

function getSecretKey(): string {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || 'uasa-nexus-session-auth-secret-key-2027'
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derivedKey}`
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash) return false
  const delimiter = storedHash.includes('$') ? '$' : storedHash.includes(':') ? ':' : ''
  if (!delimiter) return false
  const parts = storedHash.split(delimiter)
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, originalHash] = parts
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64)
    const expectedKey = Buffer.from(originalHash, 'hex')
    if (derivedKey.length !== expectedKey.length) return false
    return crypto.timingSafeEqual(derivedKey, expectedKey)
  } catch {
    return false
  }
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return buf.toString('base64url')
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}

export interface SessionTokenPayload {
  uid: string
  email: string
  projectId: string
  exp: number
}

export function signSessionToken(payload: { uid: string; email: string; projectId?: string }): string {
  const secret = getSecretKey()
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: SessionTokenPayload = {
    uid: payload.uid,
    email: payload.email.toLowerCase().trim(),
    projectId: payload.projectId || 'uasa-nexus',
    exp: now + TOKEN_EXPIRY_SECONDS,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))
  const dataToSign = `${encodedHeader}.${encodedPayload}`
  const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest()
  const encodedSignature = base64UrlEncode(signature)

  return `${dataToSign}.${encodedSignature}`
}

export function verifySessionToken(token: string): VerifiedIdentity | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const secret = getSecretKey()
  const dataToSign = `${encodedHeader}.${encodedPayload}`

  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(dataToSign).digest()
    const receivedSignature = Buffer.from(encodedSignature, 'base64url')

    if (expectedSignature.length !== receivedSignature.length) return null
    if (!crypto.timingSafeEqual(expectedSignature, receivedSignature)) return null

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload
    const now = Math.floor(Date.now() / 1000)
    if (!payload.exp || payload.exp < now) return null
    if (!payload.email || !payload.uid) return null

    return {
      uid: payload.uid,
      email: payload.email.toLowerCase().trim(),
      emailVerified: true,
      provider: 'password',
      projectId: payload.projectId || 'uasa-nexus',
    }
  } catch {
    return null
  }
}
