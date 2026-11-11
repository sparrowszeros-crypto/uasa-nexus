import { neon } from '@neondatabase/serverless'

export default async function handler(request: Request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ ok: false, message: 'Kaedah tidak dibenarkan.' }),
      {
        status: 405,
        headers: { ...headers, Allow: 'GET' },
      },
    )
  }

  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Konfigurasi pangkalan data belum tersedia.',
      }),
      { status: 503, headers },
    )
  }

  try {
    const sql = neon(databaseUrl)
    await sql`SELECT 1 AS connection_test`

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Sambungan pelayan dan Neon berjaya.',
      }),
      { status: 200, headers },
    )
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'Sambungan pangkalan data gagal.',
      }),
      { status: 503, headers },
    )
  }
}

export const config = {
  path: '/api/health',
}