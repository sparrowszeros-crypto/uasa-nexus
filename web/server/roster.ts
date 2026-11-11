import { AuthError, type VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'
import type { RosterCommand } from '../shared/roster.ts'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export function rosterId(value: unknown) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new AuthError(400, 'Pilihan kelas atau murid tidak sah.')
  return value
}

export function parseRosterCommand(value: unknown): RosterCommand {
  const invalid = (message = 'Maklumat murid tidak sah.'): never => { throw new AuthError(400, message) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const v = value as Record<string, unknown>
  function name() {
    if (typeof v.name !== 'string' || Array.from(v.name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return invalid()
    const result = v.name.trim().replace(/ +/g, ' ')
    if (!result || result.length > 150) return invalid()
    return result
  }
  function date() {
    const d = v.date
    if (typeof d !== 'string' || !/^20\d\d-\d{2}-\d{2}$|^2100-\d{2}-\d{2}$/.test(d)) return invalid('Tarikh tidak sah.')
    const ms = Date.parse(d)
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== d) return invalid('Tarikh tidak sah.')
    return d
  }
  const classId = rosterId(v.classId)
  switch (v.action) {
    case 'register': {
      const number = typeof v.number === 'string' ? v.number.trim().toUpperCase() : ''
      if (!/^[A-Z0-9][A-Z0-9/_-]{0,29}$/.test(number)) return invalid('Gunakan nombor daftar sekolah yang sah.')
      return { action: 'register', classId, number, name: name(), date: date() }
    }
    case 'rename': return { action: 'rename', classId, studentId: rosterId(v.studentId), name: name() }
    case 'exit':
      if (v.status !== 'transferred' && v.status !== 'removed') return invalid()
      return { action: 'exit', classId, studentId: rosterId(v.studentId), status: v.status, date: date() }
    default: return invalid()
  }
}

function access(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    actor AS (${staffActor(sql, identity)}),
    allowed_classes AS (
      SELECT c.id, c.name, c.academic_year_id, y.year, a.id AS actor_id
      FROM actor a CROSS JOIN classes c JOIN academic_years y ON y.id = c.academic_year_id
      WHERE a.secretary OR (a.class_teacher AND EXISTS (
        SELECT 1 FROM class_teachers t WHERE t.account_id = a.id AND t.class_id = c.id
      ))
    )
  `
}

export function readRoster(sql: Sql, identity: VerifiedIdentity, classId: string | null) {
  return sql`
    WITH ${access(sql, identity)}
    SELECT EXISTS(SELECT 1 FROM actor WHERE secretary OR class_teacher) AS staff,
      CASE WHEN ${classId}::uuid IS NULL THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'year', c.year)
          ORDER BY c.year DESC, c.name) FROM allowed_classes c
      ), '[]') END AS classes,
      CASE WHEN EXISTS(SELECT 1 FROM allowed_classes c WHERE c.id = ${classId}) THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'number', s.student_number, 'name', s.full_name, 'status', s.status,
          'startsOn', e.starts_on, 'endsOn', e.ends_on
        ) ORDER BY e.ends_on NULLS FIRST, s.full_name, e.id)
        FROM enrolments e JOIN students s ON s.id = e.student_id
        WHERE e.class_id = ${classId}
      ), '[]') END AS pupils
  `
}

export function changeRoster(sql: Sql, identity: VerifiedIdentity, command: RosterCommand) {
  const head = sql`
    ${access(sql, identity)},
    selected AS (SELECT * FROM allowed_classes WHERE id = ${command.classId})
  `
  if (command.action === 'register') return sql`
    WITH ${head}, pupil AS (
      INSERT INTO students (student_number, full_name)
      SELECT ${command.number}, ${command.name} FROM selected c
      WHERE c.year = EXTRACT(YEAR FROM ${command.date}::date)
        AND NOT EXISTS (SELECT 1 FROM students s WHERE upper(s.student_number) = ${command.number})
      ON CONFLICT (student_number) DO NOTHING RETURNING id
    ), enrolled AS (
      INSERT INTO enrolments (student_id, academic_year_id, class_id, starts_on)
      SELECT p.id, c.academic_year_id, c.id, ${command.date}::date FROM pupil p CROSS JOIN selected c
      RETURNING id, student_id, class_id, starts_on
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
      SELECT c.actor_id, 'student.registered', 'student', e.student_id, to_jsonb(e)
      FROM selected c CROSS JOIN enrolled e RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM selected) AS allowed,
      EXISTS(SELECT 1 FROM selected WHERE year = EXTRACT(YEAR FROM ${command.date}::date)) AS valid_date,
      EXISTS(SELECT 1 FROM logged) AS changed
  `

  const target = sql`
    SELECT s.id, s.full_name, s.status, e.id AS enrolment_id, e.starts_on, c.actor_id, c.id AS class_id
    FROM selected c JOIN enrolments e ON e.class_id = c.id JOIN students s ON s.id = e.student_id
    WHERE s.id = ${command.studentId} AND s.status = 'active' AND e.ends_on IS NULL
      AND NOT EXISTS (SELECT 1 FROM enrolments other
        WHERE other.student_id = s.id AND other.id <> e.id AND other.ends_on IS NULL)
    FOR UPDATE OF s
  `
  if (command.action === 'rename') return sql`
    WITH ${head}, target AS (${target}), changed AS (
      UPDATE students s SET full_name = ${command.name}
      FROM target t WHERE s.id = t.id AND s.status = 'active'
      RETURNING s.id, s.full_name, t.full_name AS previous, t.actor_id, t.class_id
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, before_value, after_value)
      SELECT actor_id, 'student.renamed', 'student', id,
        jsonb_build_object('name', previous, 'class_id', class_id),
        jsonb_build_object('name', full_name, 'class_id', class_id)
      FROM changed RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM selected) AS allowed, true AS valid_date,
      EXISTS(SELECT 1 FROM logged) AS changed
  `

  return sql`
    WITH ${head}, target AS (${target}), changed AS (
      UPDATE students s SET status = ${command.status}, status_date = ${command.date}::date
      FROM target t WHERE s.id = t.id AND s.status = 'active'
        AND ${command.date}::date BETWEEN t.starts_on AND (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      RETURNING s.id, s.status, s.status_date, t.actor_id, t.enrolment_id, t.class_id
    ), closed AS (
      UPDATE enrolments e SET ends_on = s.status_date
      FROM changed s WHERE e.id = s.enrolment_id RETURNING e.id
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, before_value, after_value)
      SELECT s.actor_id, 'student.exited', 'student', s.id, jsonb_build_object('status', 'active'),
        jsonb_build_object('status', s.status, 'date', s.status_date, 'class_id', s.class_id)
      FROM changed s JOIN closed e ON e.id = s.enrolment_id RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM selected) AS allowed,
      COALESCE((SELECT ${command.date}::date BETWEEN starts_on AND
        (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date FROM target), true) AS valid_date,
      EXISTS(SELECT 1 FROM logged) AS changed
  `
}
