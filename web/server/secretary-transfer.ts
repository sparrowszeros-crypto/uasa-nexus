import type { VerifiedIdentity } from './auth-core.ts'
import { staffActor, type Sql } from './staff-data.ts'

export function lockStaffRoleChanges(sql: Sql) {
  return sql`SELECT pg_advisory_xact_lock(7116505, 1)`
}

function eligibleTeachers(sql: Sql, projectId: string) {
  return sql`
    SELECT a.id, a.display_name AS name, a.email
    FROM accounts a
    WHERE a.active
      AND EXISTS (
        SELECT 1 FROM account_roles r
        WHERE r.account_id = a.id AND r.role IN ('class_teacher', 'subject_teacher')
      )
      AND NOT EXISTS (
        SELECT 1 FROM account_roles r
        WHERE r.account_id = a.id AND r.role NOT IN ('class_teacher', 'subject_teacher')
      )
      AND EXISTS (
        SELECT 1 FROM account_identities i
        WHERE i.account_id = a.id AND i.provider = 'firebase' AND i.project_id = ${projectId}
      )
  `
}

export function listSuccessors(sql: Sql, identity: VerifiedIdentity) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)})
    SELECT COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name, t.email)
      FROM (${eligibleTeachers(sql, identity.projectId)}) t WHERE t.id <> actor.id
    ), '[]') AS teachers
    FROM actor WHERE secretary
  `
}

export function transferSecretary(sql: Sql, identity: VerifiedIdentity, teacherId: string, teacherEmail: string) {
  return sql`
    WITH actor AS (${staffActor(sql, identity)}),
    successor AS (
      SELECT t.id FROM (${eligibleTeachers(sql, identity.projectId)}) t
      JOIN actor a ON a.secretary AND a.id <> t.id
      WHERE t.id = ${teacherId} AND t.email = ${teacherEmail}
    ), relinquished AS (
      DELETE FROM account_roles r USING actor a, successor s
      WHERE a.secretary AND r.account_id = a.id AND r.role = 'exam_secretary'
      RETURNING r.account_id AS former_id, s.id AS successor_id
    ), promoted AS (
      INSERT INTO account_roles (account_id, role)
      SELECT successor_id, 'exam_secretary' FROM relinquished
      RETURNING account_id
    ), logged AS (
      INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, before_value, after_value)
      SELECT r.former_id, 'secretary.transferred', 'account', p.account_id,
        jsonb_build_object('secretaryId', r.former_id), jsonb_build_object('secretaryId', p.account_id)
      FROM promoted p JOIN relinquished r ON r.successor_id = p.account_id
    )
    SELECT EXISTS (SELECT 1 FROM actor WHERE secretary) AS allowed,
      EXISTS (SELECT 1 FROM promoted) AS transferred
  `
}
