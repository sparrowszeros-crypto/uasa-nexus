import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { AuthError } from './auth-core.ts'
import type { VerifiedIdentity } from './auth-core.ts'
import { isStaffRole } from '../shared/auth.ts'
import type { AccountProfile } from '../shared/auth.ts'

export function staffQueries(sql: NeonQueryFunction<false, false>, identity: VerifiedIdentity) {
  return [
    sql`
      SELECT a.id, a.email, a.display_name,
        array_agg(DISTINCT r.role ORDER BY r.role) AS roles
      FROM accounts a
      JOIN account_roles r ON r.account_id = a.id
      WHERE a.active = true AND a.email = ${identity.email}
        AND r.role IN ('exam_secretary','class_teacher','subject_teacher')
      GROUP BY a.id, a.email, a.display_name
    `,
  ]
}

export async function findStaffAccount(identity: VerifiedIdentity): Promise<AccountProfile | null> {
  if (!process.env.DATABASE_URL) throw new AuthError(503, 'Konfigurasi pangkalan data belum tersedia.')
  const sql = neon(process.env.DATABASE_URL)

  // Selaraskan identiti Firebase dengan akaun guru
  if (identity.uid && identity.projectId) {
    try {
      await sql`
        INSERT INTO account_identities (account_id, provider, project_id, subject)
        SELECT a.id, 'firebase', ${identity.projectId}, ${identity.uid}
        FROM accounts a
        WHERE a.email = ${identity.email} AND a.active = true
        ON CONFLICT (account_id, provider, project_id)
        DO UPDATE SET subject = EXCLUDED.subject
      `
    } catch {
      // Abaikan jika tiada konflik
    }
  }

  const rows = await sql`
    SELECT a.id, a.email, a.display_name,
      array_agg(DISTINCT r.role ORDER BY r.role) AS roles
    FROM accounts a
    JOIN account_roles r ON r.account_id = a.id
    WHERE a.active = true AND a.email = ${identity.email}
      AND r.role IN ('exam_secretary','class_teacher','subject_teacher')
    GROUP BY a.id, a.email, a.display_name
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
