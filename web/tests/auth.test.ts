import test from 'node:test'
import assert from 'node:assert/strict'
import { authenticateStaff, authErrorResponse, AuthError, readBearer } from '../server/auth-core.ts'
import type { AuthDependencies, VerifiedIdentity } from '../server/auth-core.ts'
import type { AccountProfile } from '../shared/auth.ts'

const identity: VerifiedIdentity = { uid: 'verified-uid', projectId: 'school-project',
  email: 'TEACHER@example.test', emailVerified: true, provider: 'google.com' }
const profile: AccountProfile = { id: 'school-account', email: 'teacher@example.test',
  displayName: 'Teacher', roles: ['class_teacher', 'subject_teacher'] }
const defaults: AuthDependencies = {
  verify: async () => identity,
  findOrBind: async () => profile,
}
test('missing or malformed credentials never reach verification or database', async () => {
  for (const header of [null, '', 'Basic abc', 'Bearer', 'Bearer token extra', 'Bearer ' + 'a'.repeat(16001)]) {
    let touched = false
    await assert.rejects(authenticateStaff(header, {
      verify: async () => { touched = true; return identity },
      findOrBind: async () => { touched = true; return profile },
    }), (error: unknown) => error instanceof AuthError && error.status === 401)
    assert.equal(touched, false)
  }
})
test('bearer parsing preserves token and accepts case-insensitive scheme', () => {
  assert.equal(readBearer('bearer TOKEN'), 'TOKEN')
})
test('invalid or revoked token never reaches school database', async () => {
  let touched = false
  await assert.rejects(authenticateStaff('Bearer invalid', {
    verify: async () => { throw new AuthError(401, 'expired') },
    findOrBind: async () => { touched = true; return profile },
  }), (error: unknown) => error instanceof AuthError && error.status === 401)
  assert.equal(touched, false)
})
test('unverified, missing-email or non-Google identity is denied before lookup', async () => {
  for (const changes of [{ emailVerified: false }, { email: undefined }, { uid: '' },
                         { projectId: '' }, { provider: 'password' }]) {
    let touched = false
    await assert.rejects(authenticateStaff('Bearer verified', {
      verify: async () => ({ ...identity, ...changes }),
      findOrBind: async () => { touched = true; return profile },
    }), AuthError)
    assert.equal(touched, false)
  }
})
test('verified Google identity alone does not grant school access', async () => {
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
  const result = await authenticateStaff('Bearer verified', {
    ...defaults,
    findOrBind: async (verified) => {
      assert.equal(verified.email, 'teacher@example.test')
      assert.equal(verified.uid, identity.uid)
      assert.equal(verified.projectId, identity.projectId)
      return profile
    },
  })
  assert.deepEqual(result, profile)
})
test('database failures do not become authentication success', async () => {
  await assert.rejects(authenticateStaff('Bearer verified', {
    ...defaults, findOrBind: async () => { throw new Error('database unavailable') },
  }))
})
test('unexpected errors never disclose tokens, keys or connection strings', async () => {
  const response = authErrorResponse(new Error('postgresql://user:private-password@host/db'))
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.text()).includes('private-password'), false)
})
test('expected authorization errors retain status and clear user message', async () => {
  const response = authErrorResponse(new AuthError(403, 'Akses tidak dibenarkan'))
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { ok: false, message: 'Akses tidak dibenarkan' })
})
