import type { VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'

export function readSlipRows(sql: Sql, identity: VerifiedIdentity, examId: string | null, classId: string | null, studentId: string | null, bulk = false) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)}), allowed AS (
      SELECT DISTINCT e.id AS exam_id, e.name AS exam_name, c.id AS class_id,
        c.name AS class_name, y.year
      FROM actor a
      JOIN exams e ON e.status = 'published' AND e.published_at <= now()
      JOIN academic_years y ON y.id = e.academic_year_id
      JOIN exam_subjects es ON es.exam_id = e.id AND es.academic_year_id = e.academic_year_id
      JOIN classes c ON c.id = es.class_id AND c.academic_year_id = e.academic_year_id
      WHERE a.secretary OR (a.class_teacher AND EXISTS (
        SELECT 1 FROM class_teachers t WHERE t.account_id = a.id AND t.class_id = c.id
      ))
    ), selected AS (
      SELECT * FROM allowed WHERE exam_id = ${examId} AND class_id = ${classId}
        AND (NOT ${bulk}::boolean OR EXISTS (SELECT 1 FROM actor WHERE secretary))
    ), pupils AS (
      SELECT DISTINCT p.id, p.full_name AS name, p.student_number AS number
      FROM selected a
      JOIN exam_subjects es ON es.exam_id = a.exam_id AND es.class_id = a.class_id
      JOIN results r ON r.exam_subject_id = es.id AND r.attendance IN ('present', 'absent')
      JOIN students p ON p.id = r.student_id
      WHERE EXISTS (
        SELECT 1 FROM enrolments en WHERE en.class_id = a.class_id AND en.student_id = p.id
      )
    ), chosen AS (
      SELECT * FROM pupils WHERE ${bulk}::boolean OR id = ${studentId}
    ), subjects AS (
      SELECT p.id AS pupil_id, s.id, s.name, s.code, r.mark, COALESCE(r.attendance, 'pending') AS attendance
      FROM selected a CROSS JOIN chosen p
      JOIN exam_subjects es ON es.exam_id = a.exam_id AND es.class_id = a.class_id
      JOIN subjects s ON s.id = es.subject_id
      LEFT JOIN results r ON r.exam_subject_id = es.id AND r.student_id = p.id
    ), slips AS (
      SELECT jsonb_build_object('id', p.id, 'name', p.name, 'number', p.number) AS pupil, jsonb_agg(to_jsonb(s) - 'pupil_id' ORDER BY s.name, s.code) AS subjects
      FROM chosen p JOIN subjects s ON s.pupil_id = p.id GROUP BY p.id, p.name, p.number
    )
    SELECT EXISTS(SELECT 1 FROM actor WHERE secretary OR class_teacher) AS staff,
      EXISTS(SELECT 1 FROM actor WHERE secretary) AS secretary,
      CASE WHEN ${examId}::uuid IS NULL THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('examId', exam_id, 'examName', exam_name,
          'classId', class_id, 'className', class_name, 'year', year)
          ORDER BY year DESC, exam_name, class_name) FROM allowed
      ), '[]') END AS options,
      EXISTS(SELECT 1 FROM selected) AS allowed,
      CASE WHEN NOT ${bulk}::boolean AND ${studentId}::uuid IS NULL THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(pupils) ORDER BY name, id) FROM pupils
      ), '[]') END AS pupils,
      (SELECT pupil FROM slips WHERE NOT ${bulk}::boolean) AS pupil,
      CASE WHEN ${bulk}::boolean THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(slips) ORDER BY pupil ->> 'name', pupil ->> 'id') FROM slips
      ), '[]') END AS slips,
      COALESCE((SELECT jsonb_agg(to_jsonb(subjects) - 'pupil_id' ORDER BY name, code) FROM subjects WHERE NOT ${bulk}::boolean), '[]') AS subjects
  `
}
