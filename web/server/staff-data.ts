import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { AuthError, readBearer, requireStaffIdentity } from './auth-core.ts'
import { verifyFirebaseToken } from './firebase-admin.ts'
import type { VerifiedIdentity } from './auth-core.ts'

export type Sql = NeonQueryFunction<false, false>

export async function verifyAuthToken(token: string): Promise<VerifiedIdentity> {
  return await verifyFirebaseToken(token)
}

// Resolve the active account and current roles inside the same query as the data.
export function staffActor(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    SELECT a.id,
      bool_or(r.role = 'exam_secretary') AS secretary,
      bool_or(r.role = 'class_teacher') AS class_teacher,
      bool_or(r.role = 'subject_teacher') AS subject_teacher
    FROM accounts a
    JOIN account_identities i ON i.account_id = a.id
    JOIN account_roles r ON r.account_id = a.id
    WHERE a.active AND a.email = ${identity.email}
      AND i.provider = 'firebase' AND i.project_id = ${identity.projectId} AND i.subject = ${identity.uid}
      AND r.role IN ('exam_secretary', 'class_teacher', 'subject_teacher')
    GROUP BY a.id
  `
}

export function staffScope(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)})
    SELECT a.secretary AS "schoolWide",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'year', y.year
        ) ORDER BY y.year DESC, c.name, c.id)
        FROM classes c JOIN academic_years y ON y.id = c.academic_year_id
        WHERE a.secretary OR (a.class_teacher AND EXISTS (
          SELECT 1 FROM class_teachers t WHERE t.account_id = a.id AND t.class_id = c.id
        ))
      ), '[]'::jsonb) AS classes,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'classId', c.id, 'className', c.name, 'year', y.year,
          'subjectId', s.id, 'subjectName', s.name
        ) ORDER BY y.year DESC, c.name, s.name, c.id, s.id)
        FROM teaching_assignments t
        JOIN classes c ON c.id = t.class_id
        JOIN academic_years y ON y.id = c.academic_year_id
        JOIN subjects s ON s.id = t.subject_id
        WHERE a.subject_teacher AND t.account_id = a.id AND s.active
      ), '[]'::jsonb) AS "subjectAssignments"
    FROM actor a
  `
}

export function staffResults(sql: Sql, identity: VerifiedIdentity, selection: {
  examId: string; classId: string; subjectId: string
}) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)})
    SELECT EXISTS (SELECT 1 FROM actor) AS staff,
      (
        SELECT COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'studentId', p.id, 'studentName', p.full_name,
            'mark', r.mark, 'attendance', r.attendance
          ) ORDER BY p.full_name, p.id)
          FROM results r JOIN students p ON p.id = r.student_id
          WHERE r.exam_subject_id = es.id
        ), '[]'::jsonb)
        FROM actor a
        JOIN exams e ON e.id = ${selection.examId}
        JOIN classes c ON c.id = ${selection.classId} AND c.academic_year_id = e.academic_year_id
        JOIN subjects s ON s.id = ${selection.subjectId}
        JOIN exam_subjects es ON es.exam_id = e.id AND es.academic_year_id = e.academic_year_id
          AND es.class_id = c.id AND es.subject_id = s.id
        WHERE a.secretary
          OR (a.class_teacher AND e.status = 'published' AND e.published_at <= now() AND EXISTS (
            SELECT 1 FROM class_teachers t WHERE t.account_id = a.id AND t.class_id = c.id
          ))
          OR (a.subject_teacher AND s.active AND EXISTS (
            SELECT 1 FROM teaching_assignments t
            WHERE t.account_id = a.id AND t.class_id = c.id AND t.subject_id = s.id
          ))
      ) AS results
  `
}

export function staffDataHandler(
  read: (sql: Sql, identity: VerifiedIdentity, request: Request) => Promise<object>,
  methods: readonly string[] = ['GET'],
) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    if (!methods.includes(request.method)) {
      return Response.json({ ok: false, message: 'Kaedah tidak dibenarkan.' }, {
        status: 405, headers: { ...headers, Allow: methods.join(', ') },
      })
    }
    try {
      const bearer = readBearer(request.headers.get('authorization'))
      const identity = requireStaffIdentity(await verifyAuthToken(bearer))
      const url = process.env.DATABASE_URL
      if (!url) throw new Error('Missing database configuration')
      const data = await read(neon(url), identity, request)
      return Response.json({ ok: true, ...data }, { headers })
    } catch (error) {
      return Response.json({
        ok: false,
        message: error instanceof AuthError ? error.message : 'Data belum dapat dimuatkan. Sila cuba lagi.',
      }, { status: error instanceof AuthError ? error.status : 503, headers })
    }
  }
}
