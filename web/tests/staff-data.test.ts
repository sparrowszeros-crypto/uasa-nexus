import assert from 'node:assert/strict'
import { test } from 'node:test'
import { neon } from '@neondatabase/serverless'
import { staffResults, staffScope } from '../server/staff-data.ts'
import { readMarkRows, writeMarkRows } from '../server/exams.ts'
import { readSlipRows } from '../server/slips.ts'
import slipsHandler from '../netlify/functions/staff-slips.ts'
import { readAnalysisExams, readExamAnalysis, summarizeAnalysis } from '../server/exam-analysis.ts'
import analysisHandler from '../netlify/functions/exam-analysis.ts'
import scopeHandler from '../netlify/functions/staff-scope.ts'
import resultsHandler from '../netlify/functions/staff-results.ts'

test('staff routes reject anonymous requests and do not cache responses', async () => {
  for (const [handler, path] of [
    [scopeHandler, '/api/staff/scope'],
    [resultsHandler, '/api/staff/results'],
    [analysisHandler, '/api/admin/exam-analysis'],
    [slipsHandler, '/api/staff/slips'],
  ] as const) {
    const url = 'http://localhost' + path
    const denied = await handler(new Request(url))
    assert.equal(denied.status, 401)
    assert.equal(denied.headers.get('Cache-Control'), 'no-store')
    const method = await handler(new Request(url, { method: 'DELETE' }))
    assert.equal(method.status, 405)
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
    'subjects', 'class_teachers', 'teaching_assignments', 'students', 'exams', 'exam_subjects', 'results', 'enrolments', 'audit_events',
  ]
  const fixtures = [
    ...tables.map(table => sql.query(
      'CREATE TEMP TABLE ' + table + ' (LIKE public.' + table + ' INCLUDING ALL) ON COMMIT DROP',
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
    sql`INSERT INTO enrolments (student_id, academic_year_id, class_id, starts_on) VALUES
      (${pupil}, ${yr}, ${a}, '2027-01-01')`,
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

  const selection = { examId: draft, classId: a, subjectId: math }
  const change = { studentId: pupil, mark: 0, attendance: 'present' } as const
  const mixed = [change, { ...change, studentId: id(99) }]
  const more = [
    readMarkRows(sql, actor(1), { ...selection, classId: oldClass }),
    writeMarkRows(sql, actor(3), { ...selection, entries: [change] }),
    sql`UPDATE exams SET status = 'submitted' WHERE id = ${draft}`,
    writeMarkRows(sql, actor(3), { ...selection, entries: mixed }),
    readMarkRows(sql, actor(3), selection),
    writeMarkRows(sql, actor(3), { ...selection, entries: [change] }),
    writeMarkRows(sql, actor(3), { ...selection, entries: [change] }),
    readMarkRows(sql, actor(3), selection),
    writeMarkRows(sql, actor(3), { ...selection, subjectId: language, entries: [change] }),
    writeMarkRows(sql, actor(3), { ...selection, examId: published, entries: [change] }),
    readSlipRows(sql, actor(2), null, null, null),
    readSlipRows(sql, actor(2), published, a, pupil),
    readSlipRows(sql, actor(2), published, b, pupil),
    readSlipRows(sql, actor(2), draft, a, pupil),
    readSlipRows(sql, actor(3), published, a, pupil),
    readSlipRows(sql, actor(2), future, a, pupil),
    sql`SELECT count(*)::int AS count FROM audit_events WHERE event_type = 'result.saved'`,
  ]
  const newSubject = { ...selection, subjectId: id(70) }
  more.push(
    sql`INSERT INTO subjects (id,code,name) VALUES (${id(70)},'SAI','Sains')`,
    readMarkRows(sql, actor(1), newSubject),
    sql`SELECT count(*)::int AS count FROM exam_subjects WHERE subject_id = ${id(70)}`,
    writeMarkRows(sql, actor(1), { ...newSubject, entries: [{ ...change, mark: null, attendance: 'absent' }] }),
    readMarkRows(sql, actor(1), newSubject),
  )
  const pendingPupil = id(71)
  more.push(
    sql`INSERT INTO students (id, student_number, full_name) VALUES (${pendingPupil}, 'FIXTURE-2', 'Murid Belum Diisi')`,
    sql`INSERT INTO enrolments (student_id, academic_year_id, class_id, starts_on)
      VALUES (${pendingPupil}, ${yr}, ${b}, '2027-01-01')`,
    sql`INSERT INTO teaching_assignments (account_id, class_id, subject_id)
      VALUES (${id(1)}, ${b}, ${language}), (${id(1)}, ${oldClass}, ${math})`,
    readAnalysisExams(sql, actor(1)),
    readAnalysisExams(sql, actor(2)),
    readExamAnalysis(sql, actor(3), draft),
    readExamAnalysis(sql, actor(1), draft),
    readExamAnalysis(sql, actor(1), draft, { classId: b, subjectId: language }),
  )
  const checked = (await sql.transaction([...fixtures, ...more])).slice(fixtures.length).map(rows => rows[0])
  assert.equal(checked[0].meta, null)
  assert.deepEqual(checked[1], { status: 'draft', valid: false, saved: 0 })
  assert.deepEqual(checked[3], { status: 'submitted', valid: false, saved: 0 })
  assert.equal(checked[4].results[0].mark, 84)
  assert.equal(checked[5].saved, 1)
  assert.equal(checked[6].saved, 0)
  assert.equal(checked[7].results[0].mark, 0)
  assert.equal(checked[8].status, null)
  assert.equal(checked[9].saved, 0)
  assert.deepEqual(checked[10].options.map((o: { examId: string }) => o.examId), [published])
  assert.equal(checked[11].pupil.id, pupil)
  assert.equal(checked[11].subjects[0].mark, 85)
  for (const i of [12, 13, 14, 15]) assert.equal(checked[i].pupil, null)
  assert.equal(checked[16].count, 1)
  assert.equal(checked[18].results[0].attendance, 'pending')
  assert.equal(checked[19].count, 0)
  assert.equal(checked[20].saved, 1)
  assert.equal(checked[21].results[0].attendance, 'absent')
  assert.ok(checked[25].exams.some((exam: { id: string }) => exam.id === draft))
  assert.equal(checked[26], undefined)
  assert.deepEqual(checked[27], { allowed: false, examExists: false, groupExists: false, candidates: [], rows: [], pupils: [] })
  const report = (checked[28].rows as Parameters<typeof summarizeAnalysis>[0][]).map(summarizeAnalysis)
  const zero = report.find(row => row.classId === a && row.subjectId === math)
  const absent = report.find(row => row.classId === a && row.subjectId === id(70))
  const missing = report.find(row => row.classId === b && row.subjectId === language)
  assert.ok(zero && absent && missing)
  assert.equal(zero.markTotal, 0)
  assert.equal(zero.present, 1)
  assert.equal(zero.grades.F, 1)
  assert.equal(absent.absent, 1)
  assert.equal(absent.present, 0)
  assert.equal(absent.pending, 0)
  assert.equal(missing.expected, 1)
  assert.equal(missing.pending, 1)
  assert.equal(report.some(row => row.classId === oldClass), false)
  assert.deepEqual(checked[28].pupils, [])
  assert.deepEqual(checked[28].candidates.find((row: { classId: string }) => row.classId === a),
    { classId: a, registered: 1, attended: 1, passed: 0, failed: 1, absentAll: 0, pending: 0 })
  assert.equal(checked[28].candidates.find((row: { classId: string }) => row.classId === b).pending, 1)
  assert.deepEqual(checked[29].pupils, [{ id: pendingPupil, name: 'Murid Belum Diisi', number: 'FIXTURE-2' }])
})
