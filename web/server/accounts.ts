import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { AuthError } from './auth-core.ts'
import type { VerifiedIdentity } from './auth-core.ts'
import { isStaffRole } from '../shared/auth.ts'
import type { AccountProfile } from '../shared/auth.ts'

export function staffQueries(sql: NeonQueryFunction<false, false>, identity: VerifiedIdentity) {
  return [
    sql`
      SELECT a.id, a.email, a.display_name, a.locked,
        array_agg(DISTINCT r.role ORDER BY r.role) AS roles
      FROM accounts a
      JOIN account_roles r ON r.account_id = a.id
      WHERE a.active = true AND NOT a.locked AND a.email = ${identity.email}
        AND r.role IN ('exam_secretary','class_teacher','subject_teacher')
      GROUP BY a.id, a.email, a.display_name, a.locked
    `,
  ]
}

export async function findStaffAccount(identity: VerifiedIdentity): Promise<AccountProfile | null> {
  if (!process.env.DATABASE_URL) throw new AuthError(503, 'Konfigurasi pangkalan data belum tersedia.')
  const sql = neon(process.env.DATABASE_URL)
  const rows = await sql`
    SELECT a.id, a.email, a.display_name, a.locked,
      array_agg(DISTINCT r.role ORDER BY r.role) AS roles
    FROM accounts a
    JOIN account_roles r ON r.account_id = a.id
    WHERE a.active = true AND NOT a.locked AND a.email = ${identity.email}
      AND r.role IN ('exam_secretary','class_teacher','subject_teacher')
    GROUP BY a.id, a.email, a.display_name, a.locked
  `
  const row = rows[0]
  if (!row) return null
  const roles = Array.isArray(row.roles) ? row.roles.filter(isStaffRole) : []
  if (!roles.length) return null
  return { id: row.id, email: row.email, displayName: row.display_name, roles }
}

export async function findOrBindStaff(identity: VerifiedIdentity): Promise<AccountProfile | null> {
  return findStaffAccount(identity)
}
