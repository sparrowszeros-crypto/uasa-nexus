import { AuthError, type VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'
import { teacherRoles, type SetupCommand } from '../shared/setup.ts'
import { hashPassword } from './password.ts'

export function parseSetupCommand(value: unknown): SetupCommand {
  const invalid = (message = 'Maklumat borang tidak sah.'): never => { throw new AuthError(400, message) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const input = value as Record<string, unknown>
  function label(key: string, max: number) {
    const raw = input[key]
    if (typeof raw !== 'string' || Array.from(raw).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return invalid()
    const result = raw.trim().replace(/ +/g, ' ')
    if (!result || result.length > max) return invalid()
    return result
  }
  function id(key: string) {
    const raw = input[key]
    if (typeof raw !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw)) return invalid()
    return raw
  }
  switch (input.action) {
    case 'class': {
      const { year, level } = input
      if (typeof year !== 'number' || !Number.isInteger(year) || year < 2020 || year > 2100) return invalid()
      if (level !== 'PERALIHAN' && level !== '1' && level !== '2' && level !== '3') {
        return invalid('Pilih Peralihan atau Tingkatan 1 hingga 3.')
      }
      const name = label('name', 80).toUpperCase()
      if (name.length > 80) return invalid()
      return { action: 'class', year, level, name }
    }
    case 'subject': {
      const code = label('code', 16).toUpperCase()
      if (!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(code)) return invalid('Kod subjek tidak sah.')
      return { action: 'subject', code, name: label('name', 100) }
    }
    case 'teacher': {
      const email = label('email', 254).toLowerCase()
      if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return invalid('Gunakan alamat e-mel yang sah.')
      if (!Array.isArray(input.roles)) return invalid('Pilih sekurang-kurangnya satu peranan guru.')
      const requested = input.roles as unknown[]
      const roles = teacherRoles.filter(role => requested.includes(role))
      if (!roles.length || requested.length !== roles.length) return invalid('Pilihan peranan guru tidak sah.')
      const initialPassword = typeof input.initialPassword === 'string' && input.initialPassword.trim().length >= 6
        ? input.initialPassword.trim()
        : 'Guru2027!'
      return { action: 'teacher', email, name: label('name', 120), roles, initialPassword }
    }
    case 'unlock': {
      return { action: 'unlock', teacherId: id('teacherId') }
    }
    case 'grant':
    case 'revoke':
      return { action: input.action, teacherId: id('teacherId'), classId: id('classId'),
        subjectId: input.subjectId === null ? null : id('subjectId') }
    default: return invalid()
  }
}

export function schoolSetup(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)})
    SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'year', y.year, 'level', c.level)
        ORDER BY y.year DESC, c.name) FROM classes c JOIN academic_years y ON y.id = c.academic_year_id), '[]') AS classes,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'active', s.active)
        ORDER BY s.name, s.code) FROM subjects s), '[]') AS subjects,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'email', t.email, 'name', t.display_name, 'roles', t.roles, 'locked', t.locked, 'failedAttempts', t.failed_attempts)
        ORDER BY t.display_name, t.email) FROM (
          SELECT a.id, a.email, a.display_name, a.locked, a.failed_attempts, array_agg(r.role ORDER BY r.role) AS roles
          FROM accounts a JOIN account_roles r ON r.account_id = a.id
          WHERE a.active AND r.role IN ('class_teacher', 'subject_teacher')
          GROUP BY a.id, a.email, a.display_name, a.locked, a.failed_attempts
        ) t), '[]') AS teachers,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('teacherId', t.account_id, 'classId', t.class_id, 'subjectId', t.subject_id)
        ORDER BY t.account_id, t.class_id, t.subject_id) FROM (
          SELECT account_id, class_id, NULL::uuid AS subject_id FROM class_teachers
          UNION ALL SELECT account_id, class_id, subject_id FROM teaching_assignments
        ) t), '[]') AS assignments
    FROM actor WHERE secretary
  `
}

export function changeSchoolSetup(sql: Sql, identity: VerifiedIdentity, command: SetupCommand) {
  const actor = sql`SELECT id FROM (${staffActor(sql, identity)}) staff WHERE secretary`
  if (command.action === 'class') return sql`
    WITH actor AS (${actor}), school_year AS (
      INSERT INTO academic_years (year) SELECT ${command.year} FROM actor
      ON CONFLICT (year) DO UPDATE SET year = EXCLUDED.year RETURNING id
    ), changed AS (
      INSERT INTO classes (academic_year_id, name, level)
      SELECT y.id, ${command.name}, ${command.level} FROM school_year y
      WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.academic_year_id = y.id AND upper(c.name) = ${command.name})
      ON CONFLICT (academic_year_id, name) DO NOTHING RETURNING *
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
      SELECT a.id, 'class.created', 'class', c.id, to_jsonb(c) FROM actor a CROSS JOIN changed c
      RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM logged) AS changed
  `
  if (command.action === 'subject') return sql`
    WITH actor AS (${actor}), changed AS (
      INSERT INTO subjects (code, name)
      SELECT ${command.code}, ${command.name} FROM actor
      WHERE NOT EXISTS (SELECT 1 FROM subjects s WHERE upper(s.code) = ${command.code})
      ON CONFLICT (code) DO NOTHING RETURNING *
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
      SELECT a.id, 'subject.created', 'subject', c.id, to_jsonb(c) FROM actor a CROSS JOIN changed c
      RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM logged) AS changed
  `
  if (command.action === 'teacher') {
    const passwordHash = hashPassword(command.initialPassword || 'Guru2027!')
    return sql`
      WITH actor AS (${actor}), changed AS (
        INSERT INTO accounts (email, display_name, password_hash)
        SELECT ${command.email}, ${command.name}, ${passwordHash} FROM actor
        ON CONFLICT (email) DO NOTHING RETURNING id, email, display_name
      ), assigned AS (
        INSERT INTO account_roles (account_id, role)
        SELECT c.id, v.role FROM changed c
        CROSS JOIN jsonb_array_elements_text(${JSON.stringify(command.roles)}::jsonb) v(role)
        RETURNING account_id
      ), logged AS (
        INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
        SELECT a.id, 'teacher.registered', 'account', c.id,
          to_jsonb(c) || jsonb_build_object('roles', ${JSON.stringify(command.roles)}::jsonb)
        FROM actor a CROSS JOIN changed c WHERE EXISTS (SELECT 1 FROM assigned)
        RETURNING id
      )
      SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM logged) AS changed
    `
  }
  if (command.action === 'unlock') {
    return sql`
      WITH actor AS (${actor}), changed AS (
        UPDATE accounts
        SET locked = false, failed_attempts = 0, locked_at = NULL
        WHERE id = ${command.teacherId} AND EXISTS (SELECT 1 FROM actor)
        RETURNING id, email, display_name
      ), logged AS (
        INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, after_value)
        SELECT a.id, 'teacher.unlocked', 'account', c.id, to_jsonb(c)
        FROM actor a CROSS JOIN changed c
        RETURNING id
      )
      SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM logged) AS changed
    `
  }
  const { teacherId, classId, subjectId } = command
  const role = subjectId === null ? 'class_teacher' : 'subject_teacher'
  const eligible = sql`
    SELECT t.id FROM accounts t JOIN account_roles r ON r.account_id = t.id
    WHERE t.id = ${teacherId} AND t.active AND r.role = ${role}
      AND EXISTS (SELECT 1 FROM classes c WHERE c.id = ${classId})
      AND (${subjectId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM subjects s WHERE s.id = ${subjectId} AND s.active
      ))
      AND EXISTS (SELECT 1 FROM actor)
  `
  const change = command.action === 'grant'
    ? subjectId === null
      ? sql`INSERT INTO class_teachers (account_id, class_id)
        SELECT id, ${classId} FROM eligible ON CONFLICT DO NOTHING RETURNING account_id, class_id`
      : sql`INSERT INTO teaching_assignments (account_id, class_id, subject_id)
        SELECT id, ${classId}, ${subjectId} FROM eligible ON CONFLICT DO NOTHING RETURNING account_id, class_id, subject_id`
    : subjectId === null
      ? sql`DELETE FROM class_teachers
        WHERE account_id = ${teacherId} AND class_id = ${classId} AND EXISTS (SELECT 1 FROM actor)
        RETURNING account_id, class_id`
      : sql`DELETE FROM teaching_assignments
        WHERE account_id = ${teacherId} AND class_id = ${classId} AND subject_id = ${subjectId}
        AND EXISTS (SELECT 1 FROM actor) RETURNING account_id, class_id, subject_id`
  return sql`
    WITH actor AS (${actor}), eligible AS (${eligible}), changed AS (${change}), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, before_value, after_value)
      SELECT a.id, ${command.action === 'grant' ? 'assignment.granted' : 'assignment.revoked'},
        ${subjectId === null ? 'class_teacher' : 'teaching_assignment'}, c.class_id,
        CASE WHEN ${command.action} = 'revoke' THEN to_jsonb(c) END,
        CASE WHEN ${command.action} = 'grant' THEN to_jsonb(c) END
      FROM actor a CROSS JOIN changed c RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM logged) AS changed,
      EXISTS(SELECT 1 FROM eligible) AS eligible
  `
}
