import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
try {
  if (!process.env.DATABASE_URL) throw new Error('missing-config')
  const sql = neon(process.env.DATABASE_URL)
  const source = await readFile(new URL('../../database/002_firebase_identities.sql', import.meta.url), 'utf8')
  await sql.query(source)
  console.log('Migrasi identiti Firebase selesai. Rekod sedia ada dikekalkan.')
} catch {
  console.error('Migrasi identiti gagal. Tiada maklumat sambungan dipaparkan.')
  process.exitCode = 1
}
