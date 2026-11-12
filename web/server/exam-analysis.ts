import type { VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'
import { calculateGrade } from '../shared/exams.ts'
import { analysisGrades, type AnalysisRow } from '../shared/analysis.ts'

export function readAnalysisExams(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)})
    SELECT COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'year', y.year, 'status', e.status)
        ORDER BY y.year DESC, e.created_at DESC, e.id)
      FROM exams e JOIN academic_years y ON y.id = e.academic_year_id
    ), '[]') AS exams
    FROM actor WHERE secretary
  `
}

export function readExamAnalysis(sql: Sql, identity: VerifiedIdentity, examId: string, detail?: {
  classId: string
  subjectId: string
}) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)}),
    exam AS (
      SELECT e.id, e.academic_year_id, e.status FROM exams e
      WHERE e.id = ${examId} AND EXISTS (SELECT 1 FROM actor WHERE secretary)
    ), pairs AS (
      SELECT t.class_id, t.subject_id
      FROM exam e
      JOIN classes c ON c.academic_year_id = e.academic_year_id
      JOIN teaching_assignments t ON t.class_id = c.id
      JOIN subjects s ON s.id = t.subject_id AND s.active
      UNION
      SELECT es.class_id, es.subject_id
      FROM exam e JOIN exam_subjects es ON es.exam_id = e.id AND es.academic_year_id = e.academic_year_id
    ), groups AS (
      SELECT p.class_id, p.subject_id, c.name AS class_name, s.name AS subject_name, s.code AS subject_code,
        e.academic_year_id, e.status, es.id AS exam_subject_id
      FROM pairs p CROSS JOIN exam e
      JOIN classes c ON c.id = p.class_id AND c.academic_year_id = e.academic_year_id
      JOIN subjects s ON s.id = p.subject_id
      LEFT JOIN exam_subjects es ON es.exam_id = e.id AND es.class_id = p.class_id AND es.subject_id = p.subject_id
      WHERE (${detail?.classId ?? null}::uuid IS NULL OR p.class_id = ${detail?.classId ?? null})
        AND (${detail?.subjectId ?? null}::uuid IS NULL OR p.subject_id = ${detail?.subjectId ?? null})
    ), pupil_results AS (
      SELECT g.class_id, g.subject_id, p.id, p.full_name, p.student_number,
        CASE
          WHEN r.attendance = 'present' AND r.mark IS NOT NULL THEN 'present'
          WHEN r.attendance = 'absent' THEN 'absent'
          ELSE 'pending'
        END AS attendance,
        r.mark
      FROM groups g
      JOIN LATERAL (
        SELECT DISTINCT en.student_id
        FROM enrolments en JOIN students s ON s.id = en.student_id
        WHERE en.class_id = g.class_id AND en.academic_year_id = g.academic_year_id
          AND ((en.ends_on IS NULL AND s.status = 'active') OR (g.status = 'published' AND EXISTS (
            SELECT 1 FROM results prior
            WHERE prior.exam_subject_id = g.exam_subject_id AND prior.student_id = en.student_id
          )))
      ) roster ON true
      JOIN students p ON p.id = roster.student_id
      LEFT JOIN results r ON r.exam_subject_id = g.exam_subject_id AND r.student_id = p.id
    ), totals AS (
      SELECT g.class_id AS "classId", g.class_name AS "className",
        g.subject_id AS "subjectId", g.subject_name AS "subjectName", g.subject_code AS "subjectCode",
        count(p.id)::int AS expected,
        count(*) FILTER (WHERE p.attendance = 'present')::int AS present,
        count(*) FILTER (WHERE p.attendance = 'absent')::int AS absent,
        count(*) FILTER (WHERE p.attendance = 'pending')::int AS pending,
        COALESCE(array_agg(p.mark::float8) FILTER (WHERE p.attendance = 'present'), ARRAY[]::float8[]) AS marks
      FROM groups g
      LEFT JOIN pupil_results p USING (class_id, subject_id)
      GROUP BY g.class_id, g.class_name, g.subject_id, g.subject_name, g.subject_code
    )
    SELECT EXISTS (SELECT 1 FROM actor WHERE secretary) AS allowed,
      EXISTS (SELECT 1 FROM exam) AS "examExists",
      EXISTS (SELECT 1 FROM groups) AS "groupExists",
      CASE WHEN ${Boolean(detail)} THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(to_jsonb(totals) ORDER BY "className", "subjectName", "subjectCode") FROM totals
      ), '[]') END AS rows,
      CASE WHEN ${Boolean(detail)} THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'number', student_number)
          ORDER BY full_name, student_number) FROM pupil_results WHERE attendance = 'pending'
      ), '[]') ELSE '[]'::jsonb END AS pupils
  `
}

type AnalysisTotals = Omit<AnalysisRow, 'grades' | 'markTotal'> & { marks: number[] }

export function summarizeAnalysis({ marks, ...row }: AnalysisTotals): AnalysisRow {
  const grades = Object.fromEntries(analysisGrades.map(grade => [grade, 0])) as AnalysisRow['grades']
  let markTotal = 0
  for (const mark of marks) {
    const grade = calculateGrade(mark, 'present')
    if (grade in grades) grades[grade as keyof typeof grades]++
    markTotal += mark
  }
  return { ...row, grades, markTotal }
}
