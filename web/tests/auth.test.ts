import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authenticateStaff, authErrorResponse, AuthError, readBearer } from '../server/auth-core.ts'
import { hashPassword, verifyPassword, signSessionToken, verifySessionToken } from '../server/password.ts'
import { generateCaptcha, verifyCaptcha } from '../server/captcha.ts'
import type { AccountProfile } from '../shared/auth.ts'
import type { VerifiedIdentity } from '../server/auth-core.ts'

const identity: VerifiedIdentity = {
  uid: 'test-user-id',
  email: 'guru@sekolah.edu.my',
  emailVerified: true,
  projectId: 'uasa-nexus',
  provider: 'password',
}
const profile: AccountProfile = {
  id: 'account-1',
  email: 'guru@sekolah.edu.my',
  displayName: 'Cikgu UASA',
  roles: ['subject_teacher'],
}
const defaults = {
  verify: async () => identity,
  findOrBind: async () => profile,
}

test('missing or malformed credentials never reach verification or database', async () => {
  let touched = false
  const dependencies = {
    verify: async () => { touched = true; return identity },
    findOrBind: async () => { touched = true; return profile },
  }
  for (const header of [null, '', 'Basic abc', 'Bearer', 'Bearer  ', 'Bearer ' + 'x'.repeat(16001)]) {
    await assert.rejects(authenticateStaff(header, dependencies),
      (error: unknown) => error instanceof AuthError && error.status === 401)
  }
  assert.equal(touched, false)
})

test('bearer parsing preserves token and accepts case-insensitive scheme', () => {
  assert.equal(readBearer('Bearer test-token'), 'test-token')
  assert.equal(readBearer('bearer test-token-2'), 'test-token-2')
  assert.throws(() => readBearer('Token test-token'), AuthError)
})

test('invalid or revoked token never reaches school database', async () => {
  let touched = false
  await assert.rejects(authenticateStaff('Bearer invalid', {
    verify: async () => { throw new AuthError(401, 'expired') },
    findOrBind: async () => { touched = true; return profile },
  }), (error: unknown) => error instanceof AuthError && error.status === 401)
  assert.equal(touched, false)
})

test('missing-email or empty identity is denied before lookup', async () => {
  for (const changes of [{ email: undefined }, { uid: '' }, { projectId: '' }]) {
    let touched = false
    await assert.rejects(authenticateStaff('Bearer verified', {
      verify: async () => ({ ...identity, ...changes }),
      findOrBind: async () => { touched = true; return profile },
    }), AuthError)
    assert.equal(touched, false)
  }
})

test('verified identity alone does not grant school access without active account', async () => {
  await assert.rejects(authenticateStaff('Bearer verified', {
    ...defaults, findOrBind: async () => null,
  }), (error: unknown) => error instanceof AuthError && error.status === 403)
})

test('registered account without a staff role is denied', async () => {
  await assert.rejects(authenticateStaff('Bearer verified', {
    ...defaults, findOrBind: async () => ({ ...profile, roles: [] }),
  }), (error: unknown) => error instanceof AuthError && error.status === 403)
})

test('multiple assigned roles survive and the verified email is normalized', async () => {
  let captured: VerifiedIdentity | null = null
  const account = await authenticateStaff('Bearer verified', {
    verify: async () => ({ ...identity, email: ' GURU@Sekolah.EDU.MY ' }),
    findOrBind: async (id) => {
      captured = id
      return { ...profile, roles: ['class_teacher', 'subject_teacher'] }
    },
  })
  assert.deepEqual(account.roles, ['class_teacher', 'subject_teacher'])
  assert.equal(captured?.email, 'guru@sekolah.edu.my')
})

test('password hashing and verification work correctly', () => {
  const hash = hashPassword('MySecret123!')
  assert.equal(verifyPassword('MySecret123!', hash), true)
  assert.equal(verifyPassword('WrongPass', hash), false)
  assert.equal(verifyPassword('MySecret123!', null), false)
  assert.equal(verifyPassword('MySecret123!', 'invalid-hash'), false)
})

test('session token signing and verification work with expiry', () => {
  const token = signSessionToken({ uid: 'user-123', email: 'sparrowszeros@gmail.com' })
  assert.ok(token)
  const verified = verifySessionToken(token)
  assert.ok(verified)
  assert.equal(verified?.email, 'sparrowszeros@gmail.com')
  assert.equal(verified?.uid, 'user-123')
  assert.equal(verified?.provider, 'password')
  assert.equal(verifySessionToken('corrupted.token.value'), null)
})

test('captcha generation and verification validate answers correctly', () => {
  const { key, svg } = generateCaptcha()
  assert.ok(key)
  assert.ok(svg.includes('<svg'))
  assert.equal(verifyCaptcha(key, 'WRONG'), false)
  assert.equal(verifyCaptcha('', 'ABCD'), false)
})

test('database failures do not become authentication success', async () => {
  await assert.rejects(authenticateStaff('Bearer verified', {
    ...defaults, findOrBind: async () => { throw new Error('database connection lost') },
  }), (error: unknown) => !(error instanceof AuthError) && error instanceof Error)
})

test('unexpected errors never disclose tokens, keys or connection strings', async () => {
  const response = authErrorResponse(new Error('leak: postgres://user:secret@db.neon.tech/neondb'))
  assert.equal(response.status, 503)
  const payload = await response.json() as { ok: boolean; message: string }
  assert.equal(payload.ok, false)
  assert.equal(payload.message.includes('postgres://'), false)
  assert.equal(payload.message.includes('secret'), false)
})

test('expected authorization errors retain status and clear user message', async () => {
  const response = authErrorResponse(new AuthError(403, 'Akaun anda telah disekat.'))
  assert.equal(response.status, 403)
  const payload = await response.json() as { ok: boolean; message: string }
  assert.equal(payload.ok, false)
  assert.equal(payload.message, 'Akaun anda telah disekat.')
})
