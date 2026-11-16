import { AuthError, type VerifiedIdentity } from './auth-core.ts'
import { rosterId } from './roster.ts'
import { parseSetupCommand } from './school-setup.ts'
import { staffActor, type Sql } from './staff-data.ts'

const entities = ['exam', 'class', 'subject', 'student', 'teacher'] as const
type Entity = typeof entities[number]

export function parseRecordChange(value: unknown) {
  if (!value || typeof value !== 'object') throw new AuthError(400, 'Maklumat rekod tidak sah.')
  const input = value as Record<string, unknown>
  const entity = entities.find(item => item === input.entity)
  if (!entity || (input.action !== 'edit' && input.action !== 'delete')) {
    throw new AuthError(400, 'Tindakan rekod tidak sah.')
  }
  return { input, entity, action: input.action, id: rosterId(input.id) } as const
}

function nameOf(value: unknown, limit: number) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > limit || Array.from(name).some(c => c.charCodeAt(0) < 32)) {
    throw new AuthError(400, 'Nama tidak sah.')
  }
  return name
}

function tableFor(sql: Sql, entity: Entity) {
  switch (entity) {
    case 'exam': return sql`exams`
    case 'class': return sql`classes`
    case 'subject': return sql`subjects`
    case 'student': return sql`students`
    case 'teacher': return sql`accounts`
  }
}

export function changeRecord(sql: Sql, identity: VerifiedIdentity, command: ReturnType<typeof parseRecordChange>) {
  const { entity, action, id, input } = command
  const actor = sql`SELECT id FROM (${staffActor(sql, identity)}) a WHERE secretary`
  const table = tableFor(sql, entity)
  const teacherOnly = entity === 'teacher' ? sql`
    AND t.active AND EXISTS (SELECT 1 FROM account_roles r WHERE r.account_id = t.id AND r.role IN ('class_teacher', 'subject_teacher'))
    AND NOT EXISTS (SELECT 1 FROM account_roles r WHERE r.account_id = t.id AND r.role NOT IN ('class_teacher', 'subject_teacher'))
  ` : sql``
  const target = sql`
    SELECT t.* FROM ${table} t WHERE t.id = ${id} AND EXISTS (SELECT 1 FROM actor)
      ${teacherOnly}
    FOR UPDATE OF t
  `

  let effects = sql``
  let change
  if (action === 'delete') {
    switch (entity) {
      case 'teacher':
        effects = sql`
          , class_links AS (DELETE FROM class_teachers WHERE account_id IN (SELECT id FROM target))
          , subject_links AS (DELETE FROM teaching_assignments WHERE account_id IN (SELECT id FROM target))
        `
        change = sql`UPDATE accounts t SET active = false FROM target x WHERE t.id = x.id
          RETURNING t.id, jsonb_build_object('active', false) AS after_value`
        break
      case 'student':
        effects = sql`, removable AS (
          SELECT x.id FROM target x
          WHERE NOT EXISTS (SELECT 1 FROM results r WHERE r.student_id = x.id)
            AND NOT EXISTS (SELECT 1 FROM parent_students p WHERE p.student_id = x.id)
            AND x.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.student_id = x.id AND en.ends_on IS NOT NULL)
            AND (SELECT count(*) FROM enrolments en WHERE en.student_id = x.id) <= 1
        ), removed_enrolment AS (DELETE FROM enrolments WHERE student_id IN (SELECT id FROM removable))
        `
        change = sql`DELETE FROM students t USING removable x WHERE t.id = x.id RETURNING t.id, NULL::jsonb AS after_value`
        break
      case 'exam':
        change = sql`DELETE FROM exams t USING target x WHERE t.id = x.id AND x.status = 'draft'
          AND NOT EXISTS (SELECT 1 FROM exam_subjects es WHERE es.exam_id = x.id)
          RETURNING t.id, NULL::jsonb AS after_value`
        break
      case 'class':
        change = sql`DELETE FROM classes t USING target x WHERE t.id = x.id
          AND NOT EXISTS (SELECT 1 FROM enrolments en WHERE en.class_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM exam_subjects es WHERE es.class_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.class_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = x.id)
          RETURNING t.id, NULL::jsonb AS after_value`
        break
      case 'subject':
        change = sql`DELETE FROM subjects t USING target x WHERE t.id = x.id
          AND NOT EXISTS (SELECT 1 FROM exam_subjects es WHERE es.subject_id = x.id)
          AND NOT EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.subject_id = x.id)
          RETURNING t.id, NULL::jsonb AS after_value`
        break
    }
  } else {
    switch (entity) {
      case 'exam': {
        const name = nameOf(input.name, 100)
        const deadline = input.deadline === '' ? null : input.deadline
        if (deadline !== null && (typeof deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)
          || !Number.isFinite(Date.parse(deadline + '+08:00'))
          || new Date(Date.parse(deadline + 'Z')).toISOString().slice(0, 16) !== deadline)) {
          throw new AuthError(400, 'Tarikh akhir tidak sah.')
        }
        change = sql`UPDATE exams t SET name = ${name}, marks_deadline = ${deadline === null ? null : deadline + '+08:00'}::timestamptz
          FROM target x WHERE t.id = x.id RETURNING t.id, to_jsonb(t) AS after_value`
        break
      }
      case 'class': {
        const parsed = parseSetupCommand({ action: 'class', name: input.name, level: input.level, year: 2027 })
        if (parsed.action !== 'class') throw new AuthError(400, 'Kelas tidak sah.')
        change = sql`UPDATE classes t SET name = ${parsed.name}, level = ${parsed.level} FROM target x WHERE t.id = x.id
          AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.academic_year_id = x.academic_year_id
            AND c.id <> x.id AND upper(c.name) = ${parsed.name})
          RETURNING t.id, to_jsonb(t) AS after_value`
        break
      }
      case 'subject': {
        const parsed = parseSetupCommand({ action: 'subject', name: input.name, code: input.code })
        if (parsed.action !== 'subject') throw new AuthError(400, 'Subjek tidak sah.')
        change = sql`UPDATE subjects t SET name = ${parsed.name}, code = ${parsed.code} FROM target x WHERE t.id = x.id
          AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.id <> x.id AND upper(s.code) = ${parsed.code})
          RETURNING t.id, to_jsonb(t) AS after_value`
        break
      }
      case 'student': {
        const name = nameOf(input.name, 150)
        const number = typeof input.number === 'string' ? input.number.trim().toUpperCase() : ''
        if (!/^[A-Z0-9][A-Z0-9/_-]{0,29}$/.test(number)) throw new AuthError(400, 'Nombor daftar tidak sah.')
        change = sql`UPDATE students t SET full_name = ${name}, student_number = ${number}
          FROM target x WHERE t.id = x.id AND NOT EXISTS (
            SELECT 1 FROM students s WHERE s.id <> x.id AND upper(s.student_number) = ${number}
          ) RETURNING t.id, to_jsonb(t) AS after_value`
        break
      }
      case 'teacher': {
        const parsed = parseSetupCommand({ action: 'teacher', name: input.name, email: input.email, roles: input.roles })
        if (parsed.action !== 'teacher') throw new AuthError(400, 'Guru tidak sah.')
        const classRole = parsed.roles.includes('class_teacher')
        const subjectRole = parsed.roles.includes('subject_teacher')
        change = sql`UPDATE accounts t SET display_name = ${parsed.name}, email = ${parsed.email}
          FROM target x WHERE t.id = x.id
            AND (${classRole} OR NOT EXISTS (SELECT 1 FROM class_teachers WHERE account_id = x.id))
            AND (${subjectRole} OR NOT EXISTS (SELECT 1 FROM teaching_assignments WHERE account_id = x.id))
          RETURNING t.id, jsonb_build_object('name', t.display_name, 'email', t.email,
            'roles', ${JSON.stringify(parsed.roles)}::jsonb) AS after_value`
        effects = sql`
          , removed_roles AS (
            DELETE FROM account_roles WHERE account_id IN (SELECT id FROM changed)
            AND ((role = 'class_teacher' AND NOT ${classRole}::boolean)
              OR (role = 'subject_teacher' AND NOT ${subjectRole}::boolean))
          ), added_roles AS (
            INSERT INTO account_roles (account_id, role)
            SELECT id, value FROM changed CROSS JOIN jsonb_array_elements_text(${JSON.stringify(parsed.roles)}::jsonb)
            ON CONFLICT DO NOTHING
          ), reset_identity AS (
            DELETE FROM account_identities WHERE account_id IN (
              SELECT x.id FROM target x JOIN changed c ON c.id = x.id WHERE x.email <> ${parsed.email}
            )
          )
        `
        break
      }
    }
  }

  const before = entity === 'teacher' ? sql`jsonb_build_object('name', x.display_name, 'email', x.email, 'active', x.active,
    'roles', (SELECT jsonb_agg(role ORDER BY role) FROM account_roles WHERE account_id = x.id))` : sql`to_jsonb(x)`
  const mutation = entity === 'teacher' && action === 'edit'
    ? sql`, changed AS (${change}) ${effects}`
    : sql`${effects}, changed AS (${change})`
  return sql`
    WITH actor AS (${actor}), target AS MATERIALIZED (${target}) ${mutation},
    logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, before_value, after_value)
      SELECT a.id, ${entity + (action === 'edit' ? '.updated' : entity === 'teacher' ? '.deactivated' : '.deleted')},
        ${entity}, c.id, ${before}, c.after_value FROM changed c JOIN target x ON x.id = c.id CROSS JOIN actor a
    )
    SELECT EXISTS(SELECT 1 FROM actor) AS allowed, EXISTS(SELECT 1 FROM target) AS found,
      EXISTS(SELECT 1 FROM changed) AS changed
  `
}
