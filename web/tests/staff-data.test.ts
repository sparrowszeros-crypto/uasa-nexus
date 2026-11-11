import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neon } from '@neondatabase/serverless'
import { staffResults, staffScope } from '../server/staff-data.ts'
import scopeHandler from '../netlify/functions/staff-scope.ts'
import resultsHandler from '../netlify/functions/staff-results.ts'

test('staff routes reject anonymous requests and do not cache responses', async () => {
  for (const [handler, path] of [
    [scopeHandler, '/api/staff/scope'],
    [resultsHandler, '/api/staff/results'],
  ] as const) {
    const url = 'http://localhost' + path
    const denied = await handler(new Request(url))
    assert.equal(denied.status, 401)
    assert.equal(denied.headers.get('Cache-Control'), 'no-store')
    const method = await handler(new Request(url, { method: 'POST' }))
    assert.equal(method.status, 405)
    assert.equal(method.headers.get('Allow'), 'GET')
  }
})

const connection = process.env.DATABASE_URL
test('PostgreSQL: current roles and assignments constrain actual staff queries', {
  skip: !connection && 'Jalankan dengan --env-file=.env untuk ujian PostgreSQL',
}, async () => {
  const sql = neon(connection!)
  const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const actor = (n: number) => ({
    uid: 'fixture-' + n, email: 'fixture-' + n + '@example.invalid',
    projectId: 'test-project', emailVerified: true, provider: 'google.com',
  })
  const [a, b, math, language, draft, published, future, pupil, yr, oldYear, oldClass] =
    Array.from({ length: 11 }, (_, i) => id(i + 10))
  const query = (n: number, classId = a, subjectId = math, examId = draft) =>
    staffResults(sql, actor(n), { examId, classId, subjectId })
  const tables = [
    'accounts', 'account_roles', 'account_identities', 'academic_years', 'classes',
    'subjects', 'class_teachers', 'teaching_assignments', 'students', 'exams', 'exam_subjects', 'results',
  ]
  const fixtures = [
    ...tables.map(table => sql.query(
      'CREATE TEMP TABLE ' + table + ' (LIKE public.' + table + ' INCLUDING DEFAULTS) ON COMMIT DROP',
    )),
    ...[1, 2, 3, 4, 5].map(n => sql`
      INSERT INTO accounts (id, email, display_name, active)
      VALUES (${id(n)}, ${actor(n).email}, 'Fixture', ${n !== 5})
    `),
    ...[1, 2, 3, 4, 5].map(n => sql`
      INSERT INTO account_identities (account_id, provider, project_id, subject)
      VALUES (${id(n)}, 'firebase', ${actor(n).projectId}, ${actor(n).uid})
    `),
    sql`INSERT INTO account_roles (account_id, role) VALUES
      (${id(1)}, 'exam_secretary'), (${id(2)}, 'class_teacher'),
      (${id(3)}, 'subject_teacher'), (${id(4)}, 'parent'), (${id(5)}, 'exam_secretary')`,
    sql`INSERT INTO academic_years (id, year) VALUES (${yr}, 2027), (${oldYear}, 2026)`,
    sql`INSERT INTO classes (id, academic_year_id, name, level) VALUES
      (${a}, ${yr}, '1 A', '1'), (${b}, ${yr}, '1 B', '1'), (${oldClass}, ${oldYear}, '1 C', '1')`,
    sql`INSERT INTO subjects (id, code, name) VALUES (${math}, 'MAT', 'Matematik'), (${language}, 'BM', 'Bahasa Melayu')`,
    sql`INSERT INTO class_teachers (account_id, class_id) VALUES (${id(2)}, ${a})`,
    sql`INSERT INTO teaching_assignments (account_id, class_id, subject_id) VALUES
      (${id(3)}, ${a}, ${math}), (${id(3)}, ${b}, ${language})`,
    sql`INSERT INTO students (id, student_number, full_name) VALUES (${pupil}, 'FIXTURE-1', 'Murid Contoh')`,
    sql`INSERT INTO exams (id, academic_year_id, name, status, published_at) VALUES
      (${draft}, ${yr}, 'Draf', 'draft', NULL),
      (${published}, ${yr}, 'Diterbitkan', 'published', now()),
      (${future}, ${yr}, 'Akan datang', 'published', now() + interval '1 day')`,
    sql`INSERT INTO exam_subjects (id, exam_id, academic_year_id, class_id, subject_id) VALUES
      (${id(30)}, ${draft}, ${yr}, ${a}, ${math}), (${id(31)}, ${draft}, ${yr}, ${a}, ${language}),
      (${id(32)}, ${published}, ${yr}, ${a}, ${math}), (${id(33)}, ${draft}, ${yr}, ${b}, ${math}),
      (${id(34)}, ${future}, ${yr}, ${a}, ${math}), (${id(35)}, ${published}, ${yr}, ${b}, ${math})`,
    sql`INSERT INTO results (exam_subject_id, student_id, mark, attendance, updated_by) VALUES
      (${id(30)}, ${pupil}, 84, 'present', ${id(1)}),
      (${id(31)}, ${pupil}, 70, 'present', ${id(1)}),
      (${id(32)}, ${pupil}, 85, 'present', ${id(1)})`,
  ]

  const cases = [
    staffScope(sql, actor(1)),
    staffScope(sql, actor(2)),
    staffScope(sql, actor(3)),
    staffScope(sql, actor(4)),
    staffScope(sql, actor(5)),
    staffScope(sql, actor(6)),
    staffScope(sql, { ...actor(1), uid: 'other' }),
    staffScope(sql, { ...actor(1), projectId: 'other' }),
    query(1, a, language),
    query(1, b, math),
    query(1, oldClass),
    query(2),
    query(2, a, math, published),
    query(2, a, math, future),
    query(2, b, math, published),
    query(3),
    query(3, a, language),
    query(3, b, math),
    query(4),
    sql`DELETE FROM teaching_assignments WHERE account_id = ${id(3)} AND class_id = ${a}`,
    query(3),
    sql`DELETE FROM account_roles WHERE account_id = ${id(2)}`,
    query(2, a, math, published),
  ]
  const rows = (await sql.transaction([...fixtures, ...cases])).slice(fixtures.length)
  assert.deepEqual(rows[0][0].classes.map((c: { id: string }) => c.id), [a, b, oldClass])
  assert.equal(rows[0][0].schoolWide, true)
  assert.deepEqual(rows[1][0].classes.map((c: { id: string }) => c.id), [a])
  assert.deepEqual(rows[2][0].classes, [])
  assert.deepEqual(rows[2][0].subjectAssignments.map((t: { classId: string; subjectId: string }) =>
    [t.classId, t.subjectId]), [[a, math], [b, language]])
  for (const i of [3, 4, 5, 6, 7]) assert.deepEqual(rows[i], [], 'scope ' + i)
  assert.equal(rows[8][0].results[0].mark, 70)
  assert.deepEqual(rows[9][0], { staff: true, results: [] })
  for (const i of [10, 11, 13, 14, 16, 17, 20]) {
    assert.deepEqual(rows[i][0], { staff: true, results: null }, 'results ' + i)
  }
  assert.equal(rows[12][0].results[0].mark, 85)
  assert.deepEqual(rows[15][0].results, [{
    studentId: pupil, studentName: 'Murid Contoh', mark: 84, attendance: 'present',
  }])
  for (const i of [18, 22]) assert.deepEqual(rows[i][0], { staff: false, results: null })
})
