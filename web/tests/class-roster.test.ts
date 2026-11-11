import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neon } from '@neondatabase/serverless'
import { AuthError } from '../server/auth-core.ts'
import { changeRoster, parseRosterCommand, readRoster } from '../server/roster.ts'
import handler from '../netlify/functions/class-roster.ts'
import type { RosterCommand } from '../shared/roster.ts'

const id = (n: number) => '30000000-0000-4000-8000-' + String(n).padStart(12, '0')
const reg = { action: 'register', classId: id(10), date: '2024-02-29', name: 'Murid Contoh', number: 'DAFTAR-01' } as const

test('roster accepts school registration numbers and real calendar dates', () => {
  assert.deepEqual(parseRosterCommand({ ...reg, name: '  Murid  Contoh  ', number: ' daftar-01 ' }), reg)
  for (const value of [
    { ...reg, classId: 'other' }, { ...reg, date: '2025-02-29' }, { ...reg, name: ' ' },
    { ...reg, number: 'Nombor A B' }, { ...reg, action: 'exit', studentId: id(11), status: 'active' },
  ]) assert.throws(() => parseRosterCommand(value), e => e instanceof AuthError && e.status === 400)
})

test('roster refuses unauthenticated reads and writes', async () => {
  for (const method of ['GET', 'POST']) {
    const res = await handler(new Request('http://localhost/api/staff/class-roster', { method }))
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
  }
})

const connection = process.env.DATABASE_URL
test('Neon: register, isolate, rename and close a pupil enrolment with history and audit', {
  skip: !connection && 'Jalankan dengan --env-file=.env untuk ujian PostgreSQL',
}, async () => {
  const sql = neon(connection!)
  const identity = (n: number) => ({
    uid: 'roster-fixture-' + n, email: 'roster-fixture-' + n + '@example.invalid',
    projectId: 'test-project', emailVerified: true, provider: 'google.com',
  })
  const [sec, teacher, subject] = [1, 2, 3].map(identity)
  const other = id(12), year = id(20), pupil = id(30)
  const fixtures = [
    ...['accounts', 'account_roles', 'account_identities', 'academic_years', 'classes',
      'class_teachers', 'students', 'enrolments', 'audit_events'].map(table => sql.query(
      'CREATE TEMP TABLE ' + table + ' (LIKE public.' + table + ' INCLUDING ALL) ON COMMIT DROP',
    )),
    sql`ALTER TABLE enrolments ADD FOREIGN KEY (student_id) REFERENCES pg_temp.students(id),
      ADD FOREIGN KEY (class_id, academic_year_id) REFERENCES pg_temp.classes(id, academic_year_id)`,
    ...[1, 2, 3].flatMap(n => [
      sql`INSERT INTO accounts (id,email,display_name) VALUES (${id(n)},${identity(n).email},'Ujian')`,
      sql`INSERT INTO account_identities (account_id,provider,project_id,subject)
        VALUES (${id(n)},'firebase',${identity(n).projectId},${identity(n).uid})`,
    ]),
    sql`INSERT INTO account_roles (account_id,role) VALUES
      (${id(1)},'exam_secretary'),(${id(2)},'class_teacher'),(${id(3)},'subject_teacher')`,
    sql`INSERT INTO academic_years (id,year) VALUES (${year},2024)`,
    sql`INSERT INTO classes (id,academic_year_id,name,level)
      VALUES (${reg.classId},${year},'1 Amanah','1'),(${other},${year},'1 Budi','1')`,
    sql`INSERT INTO class_teachers (account_id,class_id) VALUES (${id(2)},${reg.classId})`,
    sql`INSERT INTO students (id,student_number,full_name) VALUES (${pupil},'DAFTAR-02','Nama Lama')`,
    sql`INSERT INTO enrolments (student_id,academic_year_id,class_id,starts_on) VALUES
      (${pupil},${year},${reg.classId},'2024-01-01')`,
  ]
  const rename = { action: 'rename', classId: reg.classId, studentId: pupil, name: 'Nama Baharu' } as const
  const exit = { action: 'exit', classId: reg.classId, studentId: pupil, status: 'transferred', date: '2024-03-01' } as const
  const write = (actor: typeof sec, command: RosterCommand) => changeRoster(sql, actor, command)
  const cases = {
    classScope: readRoster(sql, teacher, null),
    allClasses: readRoster(sql, sec, null),
    forbiddenRead: readRoster(sql, teacher, other),
    subjectRead: readRoster(sql, subject, null),
    subjectWrite: write(subject, reg),
    forbiddenWrite: write(teacher, { ...reg, classId: other }),
    invalidYear: write(teacher, { ...reg, date: '2027-01-01' }),
    registered: write(teacher, reg),
    duplicate: write(sec, { ...reg, classId: other }),
    wrongClass: write(sec, { ...rename, classId: other }),
    renamed: write(teacher, rename),
    invalidExit: write(teacher, { ...exit, date: '2023-12-31' }),
    futureExit: write(teacher, { ...exit, date: '2100-01-01' }),
    exited: write(teacher, exit),
    doubleExit: write(teacher, exit),
    cannotRenameEnded: write(teacher, rename),
    roster: readRoster(sql, teacher, reg.classId),
    revoke: sql`DELETE FROM class_teachers WHERE account_id = ${id(2)}`,
    revoked: readRoster(sql, teacher, reg.classId),
    revokedWrite: write(teacher, { ...reg, number: 'DAFTAR-03' }),
    audits: sql`SELECT actor_id,event_type,before_value,after_value FROM audit_events ORDER BY id`,
    pupilCount: sql`SELECT count(*)::integer AS total FROM students`,
  }
  const rows = (await sql.transaction([...fixtures, ...Object.values(cases)])).slice(fixtures.length)
  const r = Object.fromEntries(Object.keys(cases).map((key, i) => [key, rows[i]]))
  assert.deepEqual(r.classScope[0].classes.map((c: { id: string }) => c.id), [reg.classId])
  assert.equal(r.allClasses[0].classes.length, 2)
  assert.equal(r.subjectRead[0].staff, false)
  assert.equal(r.forbiddenRead[0].pupils, null)
  assert.equal(r.revoked[0].pupils, null)
  for (const key of ['subjectWrite', 'forbiddenWrite', 'revokedWrite']) assert.equal(r[key][0].allowed, false)
  for (const key of ['invalidYear', 'invalidExit', 'futureExit']) assert.equal(r[key][0].valid_date, false)
  for (const key of ['registered', 'renamed', 'exited']) assert.equal(r[key][0].changed, true)
  for (const key of ['duplicate', 'wrongClass', 'doubleExit', 'cannotRenameEnded']) assert.equal(r[key][0].changed, false)
  assert.equal(r.pupilCount[0].total, 2)
  const history = r.roster[0].pupils.find((p: { id: string }) => p.id === pupil)
  assert.equal(history.name, 'Nama Baharu')
  assert.equal(history.status, 'transferred')
  assert.equal(history.endsOn, '2024-03-01')
  assert.deepEqual(r.audits.map(row => row.event_type), ['student.registered', 'student.renamed', 'student.exited'])
  assert.ok(r.audits.every(row => row.actor_id === id(2)))
  assert.equal(r.audits[1].before_value.name, 'Nama Lama')
  assert.equal(r.audits[2].after_value.status, 'transferred')
})
