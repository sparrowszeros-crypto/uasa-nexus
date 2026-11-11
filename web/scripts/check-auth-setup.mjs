import { neon } from '@neondatabase/serverless'
const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
let valid = false, matches = false
try {
  const config = JSON.parse(Buffer.from(encoded ?? '', 'base64').toString('utf8'))
  valid = config.type === 'service_account' && !!config.private_key && !!config.client_email
  matches = config.project_id === process.env.VITE_FIREBASE_PROJECT_ID
} catch { /* Only boolean diagnostics are printed. */ }
console.log(JSON.stringify({ adminConfigured: !!encoded, adminShapeValid: !!valid,
  matchesWebProject: matches, emulatorConfigured: !!process.env.FIREBASE_AUTH_EMULATOR_HOST }))
if (!valid || !matches || !process.env.DATABASE_URL) process.exitCode = 1
else {
  try {
    const sql = neon(process.env.DATABASE_URL)
    const tables = await sql`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('accounts','account_roles','account_identities')
      ORDER BY table_name`
    console.log(JSON.stringify({ accountTables: tables.map(row => row.table_name) }))
  } catch { console.error('Semakan pangkalan data gagal; maklumat sambungan tidak dipaparkan.'); process.exitCode = 1 }
}
