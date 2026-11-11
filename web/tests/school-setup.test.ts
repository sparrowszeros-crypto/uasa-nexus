import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neon } from '@neondatabase/serverless'
import { AuthError } from '../server/auth-core.ts'
import { changeSchoolSetup, parseSetupCommand, schoolSetup } from '../server/school-setup.ts'
import { staffScope } from '../server/staff-data.ts'
import handler from '../netlify/functions/school-setup.ts'
import type { SetupCommand } from '../shared/setup.ts'

test('validates school levels, email, teacher roles and identifiers', () => {
  const reject = (value: unknown) => assert.throws(() => parseSetupCommand(value), e =>
    e instanceof AuthError && e.status === 400)
  reject({ action: 'class', year: 2027, level: '4', name: '4 Budi' })
  reject({ action: 'class', year: '2027', level: '1', name: '1 Budi' })
  reject({ action: 'teacher', email: 'bukan-email', name: 'Guru', roles: ['class_teacher'] })
  reject({ action: 'teacher', email: 'guru@sekolah.edu.my', name: 'Guru', roles: ['exam_secretary'] })
  reject({ action: 'teacher', email: 'guru@sekolah.edu.my', name: 'Guru', roles: [] })
  reject({ action: 'grant', teacherId: 'x', classId: 'y', subjectId: null })
  assert.deepEqual(parseSetupCommand({
    action: 'teacher', email: ' GURU@GMAIL.COM ', name: ' Guru  Contoh ', roles: ['subject_teacher'],
  }), { action: 'teacher', email: 'guru@gmail.com', name: 'Guru Contoh', roles: ['subject_teacher'] })
})

test('admin routes require a token and refuse unsupported methods', async () => {
  const url = 'http://localhost/api/admin/school-setup'
  for (const method of ['GET', 'POST']) {
    const result = await handler(new Request(url, { method }))
    assert.equal(result.status, 401)
    assert.equal(result.headers.get('Cache-Control'), 'no-store')
  }
  const other = await handler(new Request(url, { method: 'DELETE' }))
  assert.equal(other.status, 405)
  assert.equal(other.headers.get('Allow'), 'GET, POST')
})

const connection = process.env.DATABASE_URL
test('PostgreSQL: secretary setup, deny non-admin, block duplicates, audit grant and revoke', {
  skip: !connection && 'Jalankan dengan --env-file=.env untuk ujian PostgreSQL',
}, async () => {
  const sql = neon(connection!)
  const id = (n: number) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const identity = (n: number) => ({
    uid: 'fixture-' + n, email: 'fixture-' + n + '@moe-dl.edu.my',
    projectId: 'test-project', emailVerified: true, provider: 'google.com',
  })
  const [secretary, teacher, inactive, fresh] = [1, 2, 3, 4].map(identity)
  const existingClass = id(8), subject = id(9), year = id(10)
  const fixtures = [
    ...['accounts', 'account_roles', 'account_identities', 'academic_years', 'classes', 'subjects',
      'class_teachers', 'teaching_assignments', 'audit_events'].map(table => sql.query(
      'CREATE TEMP TABLE ' + table + ' (LIKE public.' + table + ' INCLUDING ALL) ON COMMIT DROP',
    )),
    sql`INSERT INTO accounts (id, email, display_name, active) VALUES
      (${id(1)}, ${secretary.email}, 'Admin', true),
      (${id(2)}, ${teacher.email}, 'Guru', true),
      (${id(3)}, ${inactive.email}, 'Admin tidak aktif', false)`,
    ...[1, 2, 3].map(n => sql`INSERT INTO account_identities (account_id, provider, project_id, subject)
      VALUES (${id(n)}, 'firebase', ${identity(n).projectId}, ${identity(n).uid})`),
    sql`INSERT INTO account_roles (account_id, role) VALUES
      (${id(1)}, 'exam_secretary'), (${id(2)}, 'class_teacher'), (${id(2)}, 'subject_teacher'),
      (${id(3)}, 'exam_secretary')`,
    sql`INSERT INTO academic_years (id, year) VALUES (${year}, 2027)`,
    sql`INSERT INTO classes (id, academic_year_id, name, level) VALUES (${existingClass}, ${year}, '1 Amanah', '1')`,
    sql`INSERT INTO subjects (id, code, name) VALUES (${subject}, 'MAT', 'Matematik')`,
  ]
  const makeClass = { action: 'class', year: 2028, name: '1 BUDI', level: '1' } as const
  const makeTeacher: SetupCommand = { action: 'teacher', email: fresh.email, name: 'Guru Baru', roles: ['class_teacher', 'subject_teacher'] }
  const classGrant = { action: 'grant', teacherId: id(2), classId: existingClass, subjectId: null } as const
  const subjectGrant = { ...classGrant, subjectId: subject }
  const [deniedRead, deniedWrite, inactiveWrite, badUid, addedClass, duplicateClass, existingMixedCase, addedSubject,
    duplicateSubject, addedTeacher, duplicateTeacher, badGrant, addClassTeacher, duplicateGrant, addSubjectTeacher,
    setup, beforeRevoke, blockedRevoke, revoked, afterRevoke, removedRole, afterRoleRemoved, audits, roleRows] =
    (await sql.transaction([...fixtures,
      schoolSetup(sql, teacher),
      changeSchoolSetup(sql, teacher, makeClass),
      changeSchoolSetup(sql, inactive, makeTeacher),
      changeSchoolSetup(sql, { ...secretary, uid: 'other' }, makeClass),
      changeSchoolSetup(sql, secretary, makeClass),
      changeSchoolSetup(sql, secretary, makeClass),
      changeSchoolSetup(sql, secretary, { ...makeClass, year: 2027, name: '1 AMANAH' }),
      changeSchoolSetup(sql, secretary, { action: 'subject', code: 'BM', name: 'Bahasa Melayu' }),
      changeSchoolSetup(sql, secretary, { action: 'subject', code: 'BM', name: 'Pendua' }),
      changeSchoolSetup(sql, secretary, makeTeacher),
      changeSchoolSetup(sql, secretary, { ...makeTeacher, name: 'Pendua' }),
      changeSchoolSetup(sql, secretary, { ...classGrant, teacherId: id(1) }),
      changeSchoolSetup(sql, secretary, classGrant),
      changeSchoolSetup(sql, secretary, classGrant),
      changeSchoolSetup(sql, secretary, subjectGrant),
      schoolSetup(sql, secretary),
      staffScope(sql, teacher),
      changeSchoolSetup(sql, teacher, { ...subjectGrant, action: 'revoke' }),
      changeSchoolSetup(sql, secretary, { ...subjectGrant, action: 'revoke' }),
      staffScope(sql, teacher),
      sql`DELETE FROM account_roles WHERE account_id = ${id(1)}`,
      changeSchoolSetup(sql, secretary, { ...classGrant, action: 'revoke' }),
      sql`SELECT actor_id, event_type, before_value, after_value FROM audit_events ORDER BY id`,
      sql`SELECT r.role FROM account_roles r JOIN accounts a ON a.id = r.account_id WHERE a.email = ${fresh.email} ORDER BY r.role`,
    ])).slice(fixtures.length)
  assert.deepEqual(deniedRead, [])
  for (const rows of [deniedWrite, inactiveWrite, badUid, blockedRevoke, afterRoleRemoved]) {
    assert.equal(rows[0].allowed, false)
    assert.equal(rows[0].changed, false)
  }
  for (const rows of [addedClass, addedSubject, addedTeacher, addClassTeacher, addSubjectTeacher, revoked]) {
    assert.equal(rows[0].allowed, true)
    assert.equal(rows[0].changed, true)
  }
  for (const rows of [duplicateClass, existingMixedCase, duplicateSubject, duplicateTeacher, badGrant, duplicateGrant]) {
    assert.equal(rows[0].allowed, true)
    assert.equal(rows[0].changed, false)
  }
  assert.equal(badGrant[0].eligible, false)
  assert.equal(removedRole.length, 0)
  assert.equal(setup[0].classes.length, 2)
  assert.equal(setup[0].subjects.length, 2)
  assert.equal(setup[0].teachers.length, 2)
  assert.equal(setup[0].assignments.length, 2)
  assert.equal(beforeRevoke[0].subjectAssignments[0].subjectId, subject)
  assert.deepEqual(afterRevoke[0].subjectAssignments, [])
  assert.equal(afterRevoke[0].classes[0].id, existingClass)
  assert.deepEqual(audits.map(a => a.event_type), [
    'class.created', 'subject.created', 'teacher.registered', 'assignment.granted', 'assignment.granted', 'assignment.revoked',
  ])
  assert.ok(audits.every(a => a.actor_id === id(1)))
  assert.equal(audits[2].after_value.password_hash, undefined)
  assert.equal(audits[5].before_value.subject_id, subject)
  assert.equal(audits[5].after_value, null)
  assert.deepEqual(roleRows.map(r => r.role), ['class_teacher', 'subject_teacher'])
})
