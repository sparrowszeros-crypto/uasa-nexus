import { AuthError, type VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'
import {
  calculateGrade,
  type Exam,
  type ExamStatus,
  type ExamSubjectResultData,
  type SaveMarksPayload,
} from '../shared/exams.ts'

export async function listExams(sql: Sql, identity: VerifiedIdentity): Promise<Exam[]> {
  const actor = sql`SELECT id FROM (${staffActor(sql, identity)}) staff`
  const rows = await sql`
    WITH actor AS (${actor})
    SELECT e.id, e.name, y.year, e.status,
      e.marks_deadline AS "marksDeadline",
      e.published_at AS "publishedAt",
      e.created_at AS "createdAt"
    FROM exams e
    JOIN academic_years y ON y.id = e.academic_year_id
    WHERE EXISTS (SELECT 1 FROM actor)
    ORDER BY y.year DESC, e.created_at DESC
  `
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    year: Number(r.year),
    status: r.status as ExamStatus,
    marksDeadline: r.marksDeadline ? new Date(r.marksDeadline as string).toISOString() : null,
    publishedAt: r.publishedAt ? new Date(r.publishedAt as string).toISOString() : null,
    createdAt: new Date(r.createdAt as string).toISOString(),
  }))
}

export async function createExam(
  sql: Sql,
  identity: VerifiedIdentity,
  input: { year: number; name: string; marksDeadline?: string | null },
): Promise<Exam> {
  const actor = sql`SELECT id FROM (${staffActor(sql, identity)}) staff WHERE secretary`
  const name = input.name.trim()
  if (!name || name.length > 100) throw new AuthError(400, 'Nama peperiksaan tidak sah.')
  if (typeof input.year !== 'number' || input.year < 2020 || input.year > 2100) {
    throw new AuthError(400, 'Tahun akademik tidak sah.')
  }

  const deadline = input.marksDeadline ? new Date(input.marksDeadline).toISOString() : null

  const rows = await sql`
    WITH actor AS (${actor}),
    school_year AS (
      INSERT INTO academic_years (year)
      SELECT ${input.year} FROM actor
      ON CONFLICT (year) DO UPDATE SET year = EXCLUDED.year
      RETURNING id
    ),
    inserted AS (
      INSERT INTO exams (academic_year_id, name, status, marks_deadline)
      SELECT y.id, ${name}, 'draft', ${deadline}::timestamptz
      FROM school_year y CROSS JOIN actor a
      RETURNING id, academic_year_id, name, status, marks_deadline, published_at, created_at
    ),
    logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
      SELECT a.id, 'exam.created', 'exam', i.id, to_jsonb(i)
      FROM actor a CROSS JOIN inserted i
      RETURNING id
    )
    SELECT i.id, i.name, ${input.year} AS year, i.status,
      i.marks_deadline AS "marksDeadline",
      i.published_at AS "publishedAt",
      i.created_at AS "createdAt"
    FROM inserted i
  `

  const r = rows[0]
  if (!r) throw new AuthError(403, 'Hanya setiausaha peperiksaan boleh mencipta peperiksaan.')
  return {
    id: r.id as string,
    name: r.name as string,
    year: Number(r.year),
    status: r.status as ExamStatus,
    marksDeadline: r.marksDeadline ? new Date(r.marksDeadline as string).toISOString() : null,
    publishedAt: r.publishedAt ? new Date(r.publishedAt as string).toISOString() : null,
    createdAt: new Date(r.createdAt as string).toISOString(),
  }
}

export async function updateExamStatus(
  sql: Sql,
  identity: VerifiedIdentity,
  input: { examId: string; status: ExamStatus },
): Promise<void> {
  const actor = sql`SELECT id FROM (${staffActor(sql, identity)}) staff WHERE secretary`
  const publishedAt = input.status === 'published' ? sql`now()` : sql`NULL`

  const rows = await sql`
    WITH actor AS (${actor}),
    updated AS (
      UPDATE exams
      SET status = ${input.status}, published_at = ${publishedAt}
      WHERE id = ${input.examId} AND EXISTS (SELECT 1 FROM actor)
      RETURNING id, name, status, published_at
    ),
    logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
      SELECT a.id, 'exam.status_updated', 'exam', u.id, to_jsonb(u)
      FROM actor a CROSS JOIN updated u
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM actor) AS allowed, EXISTS (SELECT 1 FROM updated) AS updated
  `

  const r = rows[0]
  if (!r?.allowed) throw new AuthError(403, 'Hanya setiausaha peperiksaan boleh menukar status peperiksaan.')
  if (!r?.updated) throw new AuthError(404, 'Peperiksaan tidak ditemui.')
}

export async function getExamSubjectResults(
  sql: Sql,
  identity: VerifiedIdentity,
  selection: { examId: string; classId: string; subjectId: string },
): Promise<ExamSubjectResultData> {
  const actor = sql`SELECT id, secretary, subject_teacher FROM (${staffActor(sql, identity)}) staff`

  // Pastikan exam_subjects wujud bagi gabungan ini
  await sql`
    WITH actor AS (${actor}),
    exam_info AS (
      SELECT e.id AS exam_id, e.academic_year_id
      FROM exams e
      WHERE e.id = ${selection.examId}
    )
    INSERT INTO exam_subjects (exam_id, academic_year_id, class_id, subject_id)
    SELECT e.exam_id, e.academic_year_id, ${selection.classId}, ${selection.subjectId}
    FROM exam_info e
    WHERE EXISTS (SELECT 1 FROM actor a WHERE a.secretary OR (a.subject_teacher AND EXISTS (
      SELECT 1 FROM teaching_assignments t
      WHERE t.account_id = a.id AND t.class_id = ${selection.classId} AND t.subject_id = ${selection.subjectId}
    )))
    ON CONFLICT (exam_id, class_id, subject_id) DO NOTHING
  `

  // Dapatkan maklumat peperiksaan, kelas, subjek, serta murid dan markah semasa
  const rows = await sql`
    WITH actor AS (${actor}),
    es AS (
      SELECT es.id AS exam_subject_id, e.id AS exam_id, e.name AS exam_name, e.status AS exam_status,
        c.id AS class_id, c.name AS class_name, s.id AS subject_id, s.name AS subject_name, s.code AS subject_code
      FROM exam_subjects es
      JOIN exams e ON e.id = es.exam_id
      JOIN classes c ON c.id = es.class_id
      JOIN subjects s ON s.id = es.subject_id
      WHERE es.exam_id = ${selection.examId}
        AND es.class_id = ${selection.classId}
        AND es.subject_id = ${selection.subjectId}
        AND EXISTS (SELECT 1 FROM actor a WHERE a.secretary OR (a.subject_teacher AND EXISTS (
          SELECT 1 FROM teaching_assignments t
          WHERE t.account_id = a.id AND t.class_id = c.id AND t.subject_id = s.id
        )))
    ),
    pupils AS (
      SELECT p.id AS student_id, p.full_name AS student_name, p.student_number,
        r.mark, COALESCE(r.attendance, 'pending') AS attendance
      FROM enrolments en
      JOIN students p ON p.id = en.student_id
      CROSS JOIN es
      LEFT JOIN results r ON r.exam_subject_id = es.exam_subject_id AND r.student_id = p.id
      WHERE en.class_id = es.class_id
        AND en.ends_on IS NULL
        AND p.status = 'active'
      ORDER BY p.full_name, p.student_number
    )
    SELECT
      (SELECT to_jsonb(es) FROM es) AS meta,
      COALESCE((SELECT jsonb_agg(to_jsonb(pupils)) FROM pupils), '[]'::jsonb) AS results
  `

  const r = rows[0]
  if (!r?.meta) {
    throw new AuthError(403, 'Akses kemasukan markah tidak dibenarkan atau subjek belum ditugaskan.')
  }

  const meta = r.meta as {
    exam_id: string
    exam_name: string
    exam_status: ExamStatus
    class_id: string
    class_name: string
    subject_id: string
    subject_name: string
    subject_code: string
  }

  const rawResults = (r.results || []) as {
    student_id: string
    student_name: string
    student_number: string
    mark: number | string | null
    attendance: 'present' | 'absent' | 'pending'
  }[]

  return {
    examId: meta.exam_id,
    examName: meta.exam_name,
    examStatus: meta.exam_status,
    classId: meta.class_id,
    className: meta.class_name,
    subjectId: meta.subject_id,
    subjectName: meta.subject_name,
    subjectCode: meta.subject_code,
    results: rawResults.map((p) => {
      const markNum = p.mark !== null && p.mark !== undefined ? Number(p.mark) : null
      const att = p.attendance || 'pending'
      return {
        studentId: p.student_id,
        studentName: p.student_name,
        studentNumber: p.student_number,
        mark: markNum,
        attendance: att,
        grade: calculateGrade(markNum, att),
      }
    }),
  }
}

export async function saveMarks(
  sql: Sql,
  identity: VerifiedIdentity,
  payload: SaveMarksPayload,
): Promise<{ savedCount: number }> {
  const actor = sql`SELECT id, secretary, subject_teacher FROM (${staffActor(sql, identity)}) staff`

  // Dapatkan exam_subject_id
  const esRows = await sql`
    WITH actor AS (${actor})
    SELECT es.id, e.status AS exam_status, a.id AS actor_id
    FROM exam_subjects es
    JOIN exams e ON e.id = es.exam_id
    CROSS JOIN actor a
    WHERE es.exam_id = ${payload.examId}
      AND es.class_id = ${payload.classId}
      AND es.subject_id = ${payload.subjectId}
      AND (a.secretary OR (a.subject_teacher AND EXISTS (
        SELECT 1 FROM teaching_assignments t
        WHERE t.account_id = a.id AND t.class_id = ${payload.classId} AND t.subject_id = ${payload.subjectId}
      )))
  `

  const es = esRows[0]
  if (!es) throw new AuthError(403, 'Akses simpan markah tidak dibenarkan untuk pilihan ini.')
  if (es.exam_status === 'published') {
    throw new AuthError(400, 'Peperiksaan telah diterbitkan. Markah tidak boleh diubah.')
  }

  let count = 0
  for (const entry of payload.entries) {
    let markValue: number | null = null
    let attendanceValue = entry.attendance

    if (attendanceValue === 'present') {
      if (entry.mark !== null && entry.mark !== undefined && !isNaN(entry.mark)) {
        markValue = Math.min(100, Math.max(0, Math.round(entry.mark * 100) / 100))
      } else {
        attendanceValue = 'pending'
      }
    } else if (attendanceValue !== 'absent') {
      attendanceValue = 'pending'
    }

    await sql`
      INSERT INTO results (exam_subject_id, student_id, mark, attendance, updated_by, updated_at, version)
      VALUES (${es.id}, ${entry.studentId}, ${markValue}, ${attendanceValue}, ${es.actor_id}, now(), 1)
      ON CONFLICT (exam_subject_id, student_id)
      DO UPDATE SET
        mark = EXCLUDED.mark,
        attendance = EXCLUDED.attendance,
        updated_by = EXCLUDED.updated_by,
        updated_at = now(),
        version = results.version + 1
    `
    count++
  }

  // Rekod audit event
  await sql`
    INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
    VALUES (${es.actor_id}, 'results.updated', 'exam_subject', ${es.id},
      jsonb_build_object('examId', ${payload.examId}, 'classId', ${payload.classId}, 'subjectId', ${payload.subjectId}, 'savedEntries', ${count}))
  `

  return { savedCount: count }
}
